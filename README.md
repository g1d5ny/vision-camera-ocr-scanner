# @jieonist/vision-camera-ocr-scanner

On-device, structured **OCR scanner** for React Native — scan a **credit card, business card, receipt, or passport (MRZ)** with the camera and get back **structured data**, not just raw text.

Built as a [react-native-vision-camera](https://github.com/mrousavy/react-native-vision-camera) frame processor plugin on top of **Apple Vision** (iOS) and **Google ML Kit** (Android), powered by [Nitro Modules](https://nitro.margelo.com/) for zero-copy, high-FPS frame processing.

> 🚧 **Status: early development (iOS).** **MRZ (passport) and credit-card** scanning work today; business-card and receipt modes are on the [Roadmap](#roadmap). Not yet published to npm. Full docs: **https://g1d5ny.github.io/vision-camera-ocr-scanner/**

## Why this library

- 🆓 **Free & on-device** — no API keys, no servers, no per-scan fees. Nothing leaves the device.
- 🔒 **Privacy-first** — great for apps that can't send card/ID/receipt images to a cloud OCR service.
- 🏗️ **New Architecture native** — Nitro + Fabric, fast per-frame processing.
- 🧩 **Structured output** — card number, contact fields, receipt totals, MRZ fields — already parsed.

Not trying to be a paid enterprise KYC SDK (BlinkID, Dynamsoft, Scanbot). This is the **"good enough, free, on-device"** option for indie and small apps.

## Requirements

- React Native **New Architecture** (Fabric + TurboModules/Nitro) — **required**, no old-architecture support.
- [`react-native-vision-camera`](https://github.com/mrousavy/react-native-vision-camera) v4+ (v5 recommended).
- iOS 15+ / Android (ML Kit).

### Platforms

| Platform | Supported |
|---|---|
| Bare React Native (CLI) | ✅ |
| Expo **dev build** / prebuild | ✅ (config plugin) |
| Expo Go | ❌ (uses custom native code) |

## Installation

```sh
npm install @jieonist/vision-camera-ocr-scanner react-native-vision-camera react-native-nitro-modules react-native-worklets react-native-vision-camera-worklets
```

```sh
# or with yarn
yarn add @jieonist/vision-camera-ocr-scanner react-native-vision-camera react-native-nitro-modules react-native-worklets react-native-vision-camera-worklets
```

iOS:

```sh
cd ios && pod install
```

Expo (dev build):

```js
// app.json / app.config.js
{
  "expo": {
    "plugins": [
      ["react-native-vision-camera", { "cameraPermissionText": "Allow camera to scan documents" }],
      "@jieonist/vision-camera-ocr-scanner"
    ]
  }
}
```

```sh
npx expo prebuild && npx expo run:ios   # or run:android
```

## Usage

The native side does **OCR only** — `scan(frame)` returns recognized text lines. You then structure them on the JS thread with `parseMrz` / `parseCard` (the parsers aren't worklet-safe). This keeps every mode on one native call, with no extra native dependency.

```tsx
import { useCallback, useMemo, useState } from 'react';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useFrameOutput,
} from 'react-native-vision-camera';
import { scheduleOnRN } from 'react-native-worklets';
import {
  getOcrScanner,
  parseCard,
  type CardResult,
} from '@jieonist/vision-camera-ocr-scanner';

export function CardScanner() {
  const { hasPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const scanner = useMemo(() => getOcrScanner(), []);
  const [card, setCard] = useState<CardResult | null>(null);

  const onLines = useCallback((lines: string[]) => {
    const parsed = parseCard(lines); // or parseMrz(lines)
    if (parsed?.number) setCard(parsed);
  }, []);

  const frameOutput = useFrameOutput({
    pixelFormat: 'yuv',
    onFrame: (frame) => {
      'worklet';
      const ocr = scanner.scan(frame); // native OCR → { text, lines }
      if (ocr.lines.length > 0) scheduleOnRN(onLines, ocr.lines);
      frame.dispose();
    },
  });

  if (!hasPermission || device == null) return null;
  return (
    <Camera style={{ flex: 1 }} device={device} isActive outputs={[frameOutput]} />
  );
}
```

### Parsers

| Function | Returns | Self-validation |
|---|---|---|
| `parseMrz(lines)` | `MrzResult \| null` — passport/ID fields | ICAO 9303 check digits |
| `parseCard(lines)` | `CardResult \| null` — number, brand, expiry, holder | Luhn checksum |
| `detectBrand(number)` | brand string from a known card number | — |

See the docs for the full [`MrzResult`](https://g1d5ny.github.io/vision-camera-ocr-scanner/guide/mrz) and [`CardResult`](https://g1d5ny.github.io/vision-camera-ocr-scanner/guide/card) shapes.

### Native result type

```ts
interface OcrResult {
  /** Recognized text joined with newlines. */
  text: string;
  /** Recognized lines, ordered top-to-bottom. Feed these to parseMrz / parseCard. */
  lines: string[];
}
```

## Permissions

This library uses the camera via VisionCamera — request permission as usual:

```ts
import { Camera } from 'react-native-vision-camera';
const status = await Camera.requestCameraPermission();
```

Add the platform strings:

- iOS — `NSCameraUsageDescription` in `Info.plist`.
- Android — `android.permission.CAMERA` in `AndroidManifest.xml`.

## Accuracy & limitations

- On-device OCR is **good enough for autofill / convenience**, not guaranteed for high-stakes verification. Always let users confirm/edit results.
- Embossed (raised) card numbers, glare, and worn documents reduce accuracy.
- For full multi-template ID parsing or certified liveness/KYC, use a commercial SDK.

## Roadmap

- [x] MRZ mode (checksum self-validates) — iOS
- [x] Credit card mode (number + expiry + brand, Luhn) — iOS
- [ ] Business card → contact
- [ ] Receipt → merchant / date / total
- [ ] Expo config plugin
- [ ] First npm release (`0.1.0`)

## Contributing

- [Development workflow](CONTRIBUTING.md#development-workflow)
- [Sending a pull request](CONTRIBUTING.md#sending-a-pull-request)
- [Code of conduct](CODE_OF_CONDUCT.md)

## License

MIT © [jieonist](https://github.com/g1d5ny)

---

Made with [create-react-native-library](https://github.com/callstack/react-native-builder-bob) · powered by [Nitro Modules](https://nitro.margelo.com/) and [VisionCamera](https://github.com/mrousavy/react-native-vision-camera)
