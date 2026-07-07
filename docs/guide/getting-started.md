# Getting Started

`@jieonist/vision-camera-ocr-scanner` is a free, on-device OCR **structured** scanner for React Native. Point the camera at a document and get back structured data — built as a [react-native-vision-camera](https://github.com/mrousavy/react-native-vision-camera) v5 frame processor on [Nitro Modules](https://nitro.margelo.com/), using Apple Vision (iOS) and Google ML Kit (Android).

> Not an enterprise KYC SDK. Positioning: **free + on-device + privacy + good-enough** for indie / small apps.

## Requirements

- React Native **New Architecture** (Fabric + Nitro) — required.
- `react-native-vision-camera` v5+, `react-native-worklets`, `react-native-vision-camera-worklets`.
- iOS 15+ / Android (ML Kit).

### Platforms

| Platform | Supported |
| --- | --- |
| Bare React Native (CLI) | ✅ |
| Expo **dev build** / prebuild | ✅ (config plugin) |
| Expo Go | ❌ (custom native code) |
| Android | ✅ (ML Kit) |

## Installation

```sh
npm install @jieonist/vision-camera-ocr-scanner \
  react-native-vision-camera react-native-nitro-modules \
  react-native-worklets react-native-vision-camera-worklets
cd ios && pod install
```

## Quick usage

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
      const ocr = scanner.scan(frame); // native OCR
      if (ocr.lines.length > 0) scheduleOnRN(onLines, ocr.lines); // parse on JS thread
      frame.dispose();
    },
  });

  if (!hasPermission || device == null) return null;
  return <Camera style={{ flex: 1 }} device={device} isActive outputs={[frameOutput]} />;
}
```

The native side does OCR only (returns text lines); parsing/structuring runs in JS (the `mrz` parser isn't worklet-safe). See [MRZ Scanning](/guide/mrz) for the result shape.

## Auto-detect (scan anything)

When you don't know the document type up front, `detectDocument(lines)` runs both parsers and returns the winner:

```ts
import { detectDocument } from '@jieonist/vision-camera-ocr-scanner';

const doc = detectDocument(lines); // { type: 'mrz' | 'card', valid, data } | null
if (doc?.type === 'mrz') console.log(doc.data.format, doc.data.valid);
else if (doc?.type === 'card') console.log(doc.data.brand, doc.data.valid);
```

MRZ wins ambiguous ties (its `<<<` structure is far more specific than a bare number, and its checksum is stronger than Luhn). When your screen already knows the type, prefer the specific parser — fewer false positives and a type-specific guide box.

## Roadmap

- [x] **MRZ** (passport / ID) — iOS & Android
- [x] **Credit card** (number + expiry + brand, Luhn) — iOS & Android
- [ ] Business card → contact
- [ ] Receipt (merchant / date / total)
- [ ] Expo config plugin
