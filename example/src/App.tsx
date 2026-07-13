import {
  createBusinessCardScanSession,
  createCardScanSession,
  createMrzScanSession,
  detectDocument,
  getOcrScanner,
  parseBusinessCard,
  parseCard,
  parseMrz,
  type BusinessCardResult,
  type CardResult,
  type MrzResult,
  type OcrLine,
} from '@jieonist/vision-camera-ocr-scanner';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  Camera,
  CommonResolutions,
  useCameraDevice,
  useCameraPermission,
  useFrameOutput,
} from 'react-native-vision-camera';
import { scheduleOnRN } from 'react-native-worklets';

type Mode = 'mrz' | 'card' | 'bizcard' | 'auto';

// OCR takes hundreds of ms per call and scan() never throttles itself, so
// only run it on every Nth frame (~6 scans/s at a 30 fps camera). The scan
// sessions need several agreeing reads, so this rate sets how fast a scan
// confirms.
const OCR_FRAME_SKIP = 5;

export default function App() {
  const { hasPermission, requestPermission } = useCameraPermission();
  // Force the main wide-angle camera: on multi-camera devices the default
  // 'back' pick isn't always the lens best suited for close-up text.
  const device = useCameraDevice('back', { physicalDevices: ['wide-angle'] });
  const scanner = useMemo(() => getOcrScanner(), []);
  // Single frames misread; sessions accept only checksum-valid reads that
  // repeat, and vote on uncheckable fields like names.
  // requireChecksum: false so specimen passports (which carry dummy check
  // digits) still demo the flow — the result badge shows 검증 실패 for them.
  const mrzSession = useMemo(
    () => createMrzScanSession({ requireChecksum: false }),
    []
  );
  const cardSession = useMemo(() => createCardScanSession(), []);
  // Business cards have nothing to checksum — the session anchors on the
  // contact identity (email/phones) repeating instead.
  const bizSession = useMemo(() => createBusinessCardScanSession(), []);
  const [mode, setMode] = useState<Mode>('mrz');
  const [mrz, setMrz] = useState<MrzResult | null>(null);
  const [card, setCard] = useState<CardResult | null>(null);
  const [biz, setBiz] = useState<BusinessCardResult | null>(null);
  // Dev-only: the raw OCR lines the parser last received, overlaid on the
  // camera so heuristics can be tuned against real cards. Never logged.
  const [debugLines, setDebugLines] = useState<string[]>([]);

  // Capture the document once its session is confident, then freeze.
  const handleLines = useCallback(
    (lines: string[], lineItems?: OcrLine[]) => {
      if (__DEV__) setDebugLines(lines);
      let mrzParse: MrzResult | null = null;
      let cardParse: CardResult | null = null;
      let bizParse: BusinessCardResult | null = null;
      if (mode === 'mrz') {
        mrzParse = parseMrz(lines);
      } else if (mode === 'card') {
        cardParse = parseCard(lines);
      } else if (mode === 'bizcard') {
        // lineItems make text size a signal (the tallest line is the name).
        bizParse = parseBusinessCard(lines, lineItems);
      } else {
        // Self-validating documents (MRZ/card) win; a business card is the
        // guarded fallback and only detected when an email is present.
        const doc = detectDocument(lines, lineItems);
        if (doc?.type === 'mrz') mrzParse = doc.data;
        else if (doc?.type === 'card') cardParse = doc.data;
        else if (doc?.type === 'bizcard') bizParse = doc.data;
      }
      if (mrzParse != null) {
        const final = mrzSession.push(mrzParse);
        if (final != null) setMrz((prev) => prev ?? final);
      }
      if (cardParse != null) {
        const final = cardSession.push(cardParse);
        if (final != null) setCard((prev) => prev ?? final);
      }
      if (bizParse != null) {
        const final = bizSession.push(bizParse);
        if (final != null) setBiz((prev) => prev ?? final);
      }
    },
    [mode, mrzSession, cardSession, bizSession]
  );

  const frameOutput = useFrameOutput({
    pixelFormat: 'yuv',
    // Default is HD_16_9 (720p) — too few pixels per glyph for document
    // text. QHD_4_3 nearly doubles pixels-per-glyph vs FHD; the earlier
    // frame corruption on the Galaxy Z Fold6 turned out to involve the zoom
    // prop, so QHD is being re-tried without zoom.
    targetResolution: CommonResolutions.QHD_4_3,
    onFrame: (frame) => {
      'worklet';
      // Dispose in finally: if scan() throws, a leaked frame stalls the
      // camera pipeline once the buffer pool runs dry.
      try {
        // Worklet closures are frozen, so the throttle counter lives on the
        // worklet runtime's globalThis instead of a captured object.
        const g = globalThis as unknown as { __ocrFrameCount?: number };
        g.__ocrFrameCount = (g.__ocrFrameCount ?? 0) + 1;
        if (g.__ocrFrameCount % OCR_FRAME_SKIP !== 0) return;
        const ocr = scanner.scan(frame);
        if (ocr.lines.length > 0) {
          scheduleOnRN(handleLines, ocr.lines, ocr.lineItems);
        }
      } finally {
        frame.dispose();
      }
    },
  });

  const reset = useCallback(() => {
    mrzSession.reset();
    cardSession.reset();
    bizSession.reset();
    setMrz(null);
    setCard(null);
    setBiz(null);
  }, [mrzSession, cardSession, bizSession]);

  const switchMode = useCallback(
    (next: Mode) => {
      mrzSession.reset();
      cardSession.reset();
      bizSession.reset();
      setMode(next);
      setMrz(null);
      setCard(null);
      setBiz(null);
    },
    [mrzSession, cardSession, bizSession]
  );

  if (!hasPermission) {
    return (
      <View style={styles.center}>
        <Text style={styles.link} onPress={requestPermission}>
          카메라 권한 허용하기
        </Text>
      </View>
    );
  }
  if (device == null) {
    return (
      <View style={styles.center}>
        <Text>카메라 기기를 찾을 수 없어요</Text>
      </View>
    );
  }

  // Captured → show the clean result and stop the camera (unmounted = no scanning).
  if (mrz != null) {
    return (
      <View style={styles.resultScreen}>
        <Text style={styles.badge}>
          {mrz.valid ? '✅ 검증됨' : '⚠️ 검증 실패'}
        </Text>
        <Text style={styles.resultTitle}>여권 정보</Text>
        <Field
          label="이름"
          value={`${mrz.firstName ?? ''} ${mrz.lastName ?? ''}`.trim()}
        />
        <Field label="여권번호" value={mrz.documentNumber} />
        <Field label="국적" value={mrz.nationality} />
        <Field label="생년월일" value={formatDate(mrz.birthDate, 'birth')} />
        <Field
          label="만료일"
          value={formatDate(mrz.expirationDate, 'expiry')}
        />
        <Field label="성별" value={mrz.sex} />
        <Pressable style={styles.button} onPress={reset}>
          <Text style={styles.buttonText}>다시 스캔</Text>
        </Pressable>
      </View>
    );
  }

  if (card != null) {
    return (
      <View style={styles.resultScreen}>
        <Text style={styles.badge}>
          {card.valid ? '✅ 검증됨 (Luhn)' : '⚠️ 검증 실패'}
        </Text>
        <Text style={styles.resultTitle}>카드 정보</Text>
        <Field label="브랜드" value={card.brand?.toUpperCase() ?? null} />
        <Field label="카드번호" value={card.numberFormatted} />
        <Field
          label="만료일"
          value={
            card.expiryMonth ? `${card.expiryMonth}/${card.expiryYear}` : null
          }
        />
        <Field label="소유자" value={card.holderName} />
        <Pressable style={styles.button} onPress={reset}>
          <Text style={styles.buttonText}>다시 스캔</Text>
        </Pressable>
      </View>
    );
  }

  if (biz != null) {
    return (
      <View style={styles.resultScreen}>
        <Text style={styles.resultTitle}>명함 정보</Text>
        <Field label="이름" value={biz.name} />
        <Field label="직함" value={biz.jobTitle} />
        <Field label="부서" value={biz.department} />
        <Field label="회사" value={biz.company} />
        {biz.phones.map((p) => (
          <Field
            key={p.number}
            label={
              p.type === 'mobile'
                ? '휴대폰'
                : p.type === 'fax'
                  ? '팩스'
                  : p.type === 'tel'
                    ? '전화'
                    : '번호'
            }
            value={p.number}
          />
        ))}
        <Field label="이메일" value={biz.email} />
        <Field label="웹사이트" value={biz.website} />
        <Field label="주소" value={biz.address} />
        <Pressable style={styles.button} onPress={reset}>
          <Text style={styles.buttonText}>다시 스캔</Text>
        </Pressable>
      </View>
    );
  }

  // Scanning.
  const hint =
    mode === 'mrz'
      ? '여권 아래쪽 MRZ를 비춰주세요'
      : mode === 'card'
        ? '카드 번호가 잘 보이게 비춰주세요'
        : mode === 'bizcard'
          ? '명함 전체가 잘 보이게 비춰주세요'
          : '여권 MRZ · 카드 · 명함을 비춰주세요';
  return (
    <View style={styles.container}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive
        outputs={[frameOutput]}
      />
      <View style={styles.tabs}>
        <ModeTab
          label="여권"
          active={mode === 'mrz'}
          onPress={() => switchMode('mrz')}
        />
        <ModeTab
          label="카드"
          active={mode === 'card'}
          onPress={() => switchMode('card')}
        />
        <ModeTab
          label="명함"
          active={mode === 'bizcard'}
          onPress={() => switchMode('bizcard')}
        />
        <ModeTab
          label="자동"
          active={mode === 'auto'}
          onPress={() => switchMode('auto')}
        />
      </View>
      <View style={styles.guide}>
        {/* 명함도 ID-1 카드와 비율이 비슷해 카드 가이드박스를 같이 쓴다. */}
        <View
          style={mode === 'mrz' ? styles.guideBoxMrz : styles.guideBoxCard}
        />
        <Text style={styles.hint}>{hint}</Text>
      </View>
      {__DEV__ && debugLines.length > 0 && (
        <View style={styles.debug} pointerEvents="none">
          {debugLines.slice(0, 10).map((line, i) => (
            <Text key={i} style={styles.debugText} numberOfLines={1}>
              {line}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

function ModeTab({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.tab, active && styles.tabActive]}
      onPress={onPress}
    >
      <Text style={[styles.tabText, active && styles.tabTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value || '-'}</Text>
    </View>
  );
}

/**
 * YYMMDD → YYYY-MM-DD.
 * `kind` disambiguates the century: expiry is always future (20xx); a birth
 * date can't be in the future, so roll it back a century when needed.
 */
function formatDate(
  yymmdd: string | null,
  kind: 'birth' | 'expiry'
): string | null {
  if (yymmdd == null || yymmdd.length !== 6) return yymmdd;
  const yy = parseInt(yymmdd.slice(0, 2), 10);
  if (Number.isNaN(yy)) return yymmdd;
  let year = 2000 + yy;
  if (kind === 'birth' && year > new Date().getFullYear()) year -= 100;
  return `${year}-${yymmdd.slice(2, 4)}-${yymmdd.slice(4, 6)}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  link: { fontSize: 16, color: '#2563eb' },

  tabs: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 999,
    padding: 4,
  },
  tab: { paddingVertical: 8, paddingHorizontal: 20, borderRadius: 999 },
  tabActive: { backgroundColor: '#2563eb' },
  tabText: { color: '#cbd5e1', fontSize: 15, fontWeight: '600' },
  tabTextActive: { color: '#fff' },

  guide: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  guideBoxMrz: {
    width: '85%',
    height: 90,
    borderWidth: 2,
    borderColor: '#22d3ee',
    borderRadius: 8,
  },
  guideBoxCard: {
    width: '85%',
    aspectRatio: 1.586, // ISO/IEC 7810 ID-1 card ratio
    borderWidth: 2,
    borderColor: '#22d3ee',
    borderRadius: 12,
  },
  hint: {
    color: '#fff',
    fontSize: 15,
    marginTop: 16,
    alignSelf: 'stretch',
    textAlign: 'center',
  },

  debug: {
    position: 'absolute',
    bottom: 24,
    left: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 8,
    padding: 8,
  },
  debugText: { color: '#a7f3d0', fontSize: 11 },

  resultScreen: {
    flex: 1,
    backgroundColor: '#0b1220',
    padding: 24,
    justifyContent: 'center',
  },
  badge: { fontSize: 16, color: '#fff', marginBottom: 8 },
  resultTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 20,
  },
  field: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#334155',
  },
  fieldLabel: { color: '#94a3b8', fontSize: 15 },
  fieldValue: { color: '#fff', fontSize: 16, fontWeight: '600' },
  button: {
    marginTop: 28,
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
