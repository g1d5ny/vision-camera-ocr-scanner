import {
  createCardScanSession,
  createMrzScanSession,
  detectDocument,
  getOcrScanner,
  parseCard,
  parseMrz,
  type CardResult,
  type MrzResult,
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

type Mode = 'mrz' | 'card' | 'auto';

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
  const [mode, setMode] = useState<Mode>('mrz');
  const [mrz, setMrz] = useState<MrzResult | null>(null);
  const [card, setCard] = useState<CardResult | null>(null);

  // Capture the document once its session is confident, then freeze.
  const handleLines = useCallback(
    (lines: string[]) => {
      let mrzParse: MrzResult | null = null;
      let cardParse: CardResult | null = null;
      if (mode === 'mrz') {
        mrzParse = parseMrz(lines);
      } else if (mode === 'card') {
        cardParse = parseCard(lines);
      } else {
        const doc = detectDocument(lines);
        if (doc?.type === 'mrz') mrzParse = doc.data;
        else if (doc?.type === 'card') cardParse = doc.data;
      }
      if (mrzParse != null) {
        const final = mrzSession.push(mrzParse);
        if (final != null) setMrz((prev) => prev ?? final);
      }
      if (cardParse != null) {
        const final = cardSession.push(cardParse);
        if (final != null) setCard((prev) => prev ?? final);
      }
    },
    [mode, mrzSession, cardSession]
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
      const ocr = scanner.scan(frame);
      if (ocr.lines.length > 0) {
        scheduleOnRN(handleLines, ocr.lines);
      }
      frame.dispose();
    },
  });

  const reset = useCallback(() => {
    mrzSession.reset();
    cardSession.reset();
    setMrz(null);
    setCard(null);
  }, [mrzSession, cardSession]);

  const switchMode = useCallback(
    (next: Mode) => {
      mrzSession.reset();
      cardSession.reset();
      setMode(next);
      setMrz(null);
      setCard(null);
    },
    [mrzSession, cardSession]
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

  // Scanning.
  const hint =
    mode === 'mrz'
      ? '여권 아래쪽 MRZ를 비춰주세요'
      : mode === 'card'
        ? '카드 번호가 잘 보이게 비춰주세요'
        : '여권 MRZ 또는 카드를 비춰주세요';
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
          label="자동"
          active={mode === 'auto'}
          onPress={() => switchMode('auto')}
        />
      </View>
      <View style={styles.guide}>
        <View
          style={mode === 'mrz' ? styles.guideBoxMrz : styles.guideBoxCard}
        />
        <Text style={styles.hint}>{hint}</Text>
      </View>
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
