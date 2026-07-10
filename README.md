# @jieonist/vision-camera-ocr-scanner

On-device, structured **OCR scanner** for React Native — scan a **credit card, business card, receipt, or passport (MRZ)** with the camera and get back **structured data**, not just raw text.

Built as a [react-native-vision-camera](https://github.com/mrousavy/react-native-vision-camera) frame processor plugin on top of **Apple Vision** (iOS) and **Google ML Kit** (Android), powered by [Nitro Modules](https://nitro.margelo.com/) for zero-copy, high-FPS frame processing.

📖 **Documentation:** **https://g1d5ny.github.io/vision-camera-ocr-scanner/** ([한국어](https://g1d5ny.github.io/vision-camera-ocr-scanner/ko/))

> 🚧 **Status: early development.** **MRZ (passport), credit-card, and business-card** scanning work today on **iOS and Android**; the receipt mode is on the [Roadmap](#roadmap). Not yet published to npm. Full docs: **https://g1d5ny.github.io/vision-camera-ocr-scanner/**

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
| Expo **dev build** / prebuild | ✅ (autolinking — a dedicated config plugin is on the [roadmap](#roadmap)) |
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

Expo (dev build) — this package needs no config plugin of its own (it autolinks); only vision-camera's plugin is required:

```js
// app.json / app.config.js
{
  "expo": {
    "plugins": [
      ["react-native-vision-camera", { "cameraPermissionText": "Allow camera to scan documents" }]
    ]
  }
}
```

```sh
npx expo prebuild && npx expo run:ios   # or run:android
```

## Usage

The native side does **OCR only** — `scan(frame, options?)` returns recognized text lines. You then structure them on the JS thread with `parseMrz` / `parseCard` (the parsers aren't worklet-safe). This keeps every mode on one native call, with no extra native dependency.

`scan()` performs real OCR on **every call** (no internal throttling) and by default recognizes only the **central band** of the frame — the middle half under a centered guide box, which preserves glyph detail and drops background text. Pass `{ roi: 'full' }` to recognize the whole frame, and throttle calls yourself in the worklet (see below).

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
      try {
        // scan() runs real OCR (hundreds of ms) on every call — throttle it.
        const g = globalThis as unknown as { __ocrFrameCount?: number };
        g.__ocrFrameCount = (g.__ocrFrameCount ?? 0) + 1;
        if (g.__ocrFrameCount % 5 !== 0) return;
        const ocr = scanner.scan(frame); // native OCR → { text, lines }
        if (ocr.lines.length > 0) scheduleOnRN(onLines, ocr.lines);
      } finally {
        frame.dispose();
      }
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
| `parseBusinessCard(lines)` | `BusinessCardResult \| null` — name, company, title, phones, email, website, address | none (heuristics) — pair with its scan session |
| `detectDocument(lines)` | `DetectedDocument \| null` — auto-detect MRZ **or** card | runs both; validates |
| `detectBrand(number)` | brand string from a known card number | — |

For a "scan any document" flow, `detectDocument(lines)` runs both self-validating parsers and returns `{ type: 'mrz' | 'card', valid, data }` (MRZ wins ambiguous ties). Business cards are deliberately excluded — a phone number alone would make almost any text "detect" as one. When your screen already knows the type, call the specific parser — fewer false positives and a mode-specific guide box.

See the docs for the full [`MrzResult`](https://g1d5ny.github.io/vision-camera-ocr-scanner/guide/mrz), [`CardResult`](https://g1d5ny.github.io/vision-camera-ocr-scanner/guide/card), and [`BusinessCardResult`](https://g1d5ny.github.io/vision-camera-ocr-scanner/guide/business-card) shapes.

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

## Handling sensitive data

> [!WARNING]
> **Never log the result objects.** `CardResult.lines` / `MrzResult.lines` contain the raw OCR lines — including the full card number (PAN) and passport fields. Logging a result object whole (e.g. `console.log(parsed)`) leaks that data into device logs and crash/analytics pipelines. Log only what you need (e.g. `parsed.valid`, `parsed.brand`), and drop the result from state as soon as the flow is done.

## Roadmap

- [x] MRZ mode (checksum self-validates) — iOS & Android
- [x] Credit card mode (number + expiry + brand, Luhn) — iOS & Android
- [x] Business card → contact (name / company / title / phones / email / address)
- [ ] Receipt → merchant / date / total
- [ ] Expo config plugin
- [ ] First npm release (`0.1.0`)

## Documentation

Full guides live at **https://g1d5ny.github.io/vision-camera-ocr-scanner/** (English) / **https://g1d5ny.github.io/vision-camera-ocr-scanner/ko/** (한국어):

- [Getting Started](https://g1d5ny.github.io/vision-camera-ocr-scanner/guide/getting-started)
- [MRZ Scanning](https://g1d5ny.github.io/vision-camera-ocr-scanner/guide/mrz)
- [Credit Card Scanning](https://g1d5ny.github.io/vision-camera-ocr-scanner/guide/card)
- [Business Card Scanning](https://g1d5ny.github.io/vision-camera-ocr-scanner/guide/business-card)

## Contributing

- [Development workflow](CONTRIBUTING.md#development-workflow)
- [Sending a pull request](CONTRIBUTING.md#sending-a-pull-request)
- [Code of conduct](CODE_OF_CONDUCT.md)

## License

MIT © [jieonist](https://github.com/g1d5ny)

---

Made with [create-react-native-library](https://github.com/callstack/react-native-builder-bob) · powered by [Nitro Modules](https://nitro.margelo.com/) and [VisionCamera](https://github.com/mrousavy/react-native-vision-camera)
