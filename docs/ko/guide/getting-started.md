# 시작하기

`@jieonist/vision-camera-ocr-scanner`는 React Native용 무료 온디바이스 OCR **구조화** 스캐너입니다. 카메라를 문서에 비추면 구조화된 데이터를 돌려줍니다 — [react-native-vision-camera](https://github.com/mrousavy/react-native-vision-camera) v5 프레임 프로세서를 [Nitro Modules](https://nitro.margelo.com/) 위에 얹어 만들었고, Apple Vision(iOS)과 Google ML Kit(Android)을 사용합니다.

> 엔터프라이즈 KYC SDK가 아닙니다. 포지셔닝: 인디/소규모 앱을 위한 **무료 + 온디바이스 + 프라이버시 + 충분한 정확도**.

## 요구사항

- React Native **New Architecture**(Fabric + Nitro) — 필수.
- `react-native-vision-camera` v5+, `react-native-worklets`, `react-native-vision-camera-worklets`.
- iOS 15+ / Android(ML Kit).

### 플랫폼

| 플랫폼 | 지원 |
| --- | --- |
| Bare React Native (CLI) | ✅ |
| Expo **dev build** / prebuild | ✅ (autolinking — 전용 config plugin은 [로드맵](#로드맵)) |
| Expo Go | ❌ (커스텀 네이티브 코드) |
| Android | ✅ (ML Kit) |

## 설치

```sh
npm install @jieonist/vision-camera-ocr-scanner \
  react-native-vision-camera react-native-nitro-modules react-native-nitro-image \
  react-native-worklets react-native-vision-camera-worklets
cd ios && pod install
```

## 빠른 사용법

```tsx
import { useCallback, useMemo, useState } from 'react';
import { Camera, useCameraDevice, useCameraPermission, useFrameOutput } from 'react-native-vision-camera';
import { scheduleOnRN } from 'react-native-worklets';
import { getOcrScanner, parseMrz, type MrzResult } from '@jieonist/vision-camera-ocr-scanner';

export function PassportScanner() {
  const { hasPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const scanner = useMemo(() => getOcrScanner(), []);
  const [mrz, setMrz] = useState<MrzResult | null>(null);

  const onLines = useCallback((lines: string[]) => {
    const parsed = parseMrz(lines);
    if (parsed?.documentNumber) setMrz(parsed);
  }, []);

  const frameOutput = useFrameOutput({
    pixelFormat: 'yuv',
    onFrame: (frame) => {
      'worklet';
      try {
        // scan()은 호출마다 실제 OCR(수백 ms)을 수행 — 직접 스로틀하세요.
        const g = globalThis as unknown as { __ocrFrameCount?: number };
        g.__ocrFrameCount = (g.__ocrFrameCount ?? 0) + 1;
        if (g.__ocrFrameCount % 5 !== 0) return;
        const ocr = scanner.scan(frame); // 네이티브 OCR
        if (ocr.lines.length > 0) scheduleOnRN(onLines, ocr.lines); // JS 스레드에서 파싱
      } finally {
        frame.dispose();
      }
    },
  });

  if (!hasPermission || device == null) return null;
  return <Camera style={{ flex: 1 }} device={device} isActive outputs={[frameOutput]} />;
}
```

네이티브 쪽은 OCR만 수행하고(텍스트 줄 반환), 파싱/구조화는 JS에서 실행됩니다(`mrz` 파서는 worklet-safe가 아닙니다). 결과 형태는 [MRZ 스캔](/ko/guide/mrz)을 참고하세요.

## 자동 인식 (아무 문서나 스캔)

문서 종류를 미리 모를 때는 `detectDocument(lines)`가 파서들을 신뢰도 순으로 돌려 승자를 반환합니다 (명함은 이메일이 있을 때만 감지):

```ts
import { detectDocument } from '@jieonist/vision-camera-ocr-scanner';

const doc = detectDocument(lines); // { type: 'mrz' | 'card', valid, data } | { type: 'bizcard', data } | null
if (doc?.type === 'mrz') console.log(doc.data.format, doc.data.valid);
else if (doc?.type === 'card') console.log(doc.data.brand, doc.data.valid);
```

모호할 땐 MRZ가 우선입니다(`<<<` 구조가 단순 번호보다 훨씬 특정적이고, 체크섬이 Luhn보다 강함). 화면이 이미 문서 종류를 안다면 전용 파서를 쓰세요 — 오탐이 적고 종류별 가이드 박스를 줄 수 있습니다.

## 로드맵

- [x] **MRZ**(여권 / 신분증) — iOS & Android
- [x] **신용카드** (번호 + 만료일 + 브랜드, Luhn) — iOS & Android
- [x] **명함** → 연락처 (이름 / 회사 / 직함 / 전화 / 이메일 / 주소) — iOS & Android
- [ ] 영수증 (상호 / 날짜 / 합계)
- [ ] Expo config plugin
