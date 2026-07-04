import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useFrameOutput,
} from 'react-native-vision-camera';
import { scheduleOnRN } from 'react-native-worklets';
import {
  getOcrScanner,
  parseMrz,
  type MrzResult,
} from '@jieonist/vision-camera-ocr-scanner';

export default function App() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const scanner = useMemo(() => getOcrScanner(), []);
  const [result, setResult] = useState<MrzResult | null>(null);

  // Capture the first readable MRZ, then freeze (stop scanning).
  const handleLines = useCallback((lines: string[]) => {
    const parsed = parseMrz(lines);
    if (parsed?.documentNumber != null) {
      setResult((prev) => prev ?? parsed);
    }
  }, []);

  const frameOutput = useFrameOutput({
    pixelFormat: 'yuv',
    onFrame: (frame) => {
      'worklet';
      const ocr = scanner.scan(frame);
      if (ocr.lines.length > 0) {
        scheduleOnRN(handleLines, ocr.lines);
      }
      frame.dispose();
    },
  });

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
  if (result != null) {
    return (
      <View style={styles.resultScreen}>
        <Text style={styles.badge}>
          {result.valid ? '✅ 검증됨' : '⚠️ 검증 실패'}
        </Text>
        <Text style={styles.resultTitle}>여권 정보</Text>
        <Field
          label="이름"
          value={`${result.firstName ?? ''} ${result.lastName ?? ''}`.trim()}
        />
        <Field label="여권번호" value={result.documentNumber} />
        <Field label="국적" value={result.nationality} />
        <Field label="생년월일" value={formatDate(result.birthDate, 'birth')} />
        <Field
          label="만료일"
          value={formatDate(result.expirationDate, 'expiry')}
        />
        <Field label="성별" value={result.sex} />
        <Pressable style={styles.button} onPress={() => setResult(null)}>
          <Text style={styles.buttonText}>다시 스캔</Text>
        </Pressable>
      </View>
    );
  }

  // Scanning.
  return (
    <View style={styles.container}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive
        outputs={[frameOutput]}
      />
      <View style={styles.guide}>
        <View style={styles.guideBox} />
        <Text style={styles.hint}>여권 아래쪽 MRZ를 비춰주세요</Text>
      </View>
    </View>
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

  guide: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  guideBox: {
    width: '85%',
    height: 90,
    borderWidth: 2,
    borderColor: '#22d3ee',
    borderRadius: 8,
  },
  hint: { color: '#fff', fontSize: 15, marginTop: 16 },

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
