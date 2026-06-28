# @jieonist/vision-camera-ocr-scanner

On-device, structured **OCR scanner** for React Native — scan a **credit card, business card, receipt, or passport (MRZ)** with the camera and get back **structured data**, not just raw text.

Built as a [react-native-vision-camera](https://github.com/mrousavy/react-native-vision-camera) frame processor plugin on top of **Apple Vision** (iOS) and **Google ML Kit** (Android), powered by [Nitro Modules](https://nitro.margelo.com/) for zero-copy, high-FPS frame processing.

> 🚧 **Status: early development.** The API below is the target design and is not all implemented / published yet. See the [Roadmap](#roadmap). Feedback welcome.

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
npm install @jieonist/vision-camera-ocr-scanner react-native-vision-camera react-native-nitro-modules react-native-worklets-core
```

```sh
# or with yarn
yarn add @jieonist/vision-camera-ocr-scanner react-native-vision-camera react-native-nitro-modules react-native-worklets-core
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

Run the scanner inside a VisionCamera frame processor and pick a `mode`:

```tsx
import { useRef } from 'react';
import { Camera, useCameraDevice, useFrameProcessor } from 'react-native-vision-camera';
import { scanOCR, type OcrResult } from '@jieonist/vision-camera-ocr-scanner';
import { Worklets } from 'react-native-worklets-core';

export function CardScanner() {
  const device = useCameraDevice('back');

  const onResult = Worklets.createRunOnJS((result: OcrResult) => {
    if (result.card) {
      console.log(result.card.number, result.card.expiry);
    }
  });

  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';
    const result = scanOCR(frame, { mode: 'card' });
    if (result.card) onResult(result);
  }, [onResult]);

  if (device == null) return null;
  return (
    <Camera
      style={{ flex: 1 }}
      device={device}
      isActive
      frameProcessor={frameProcessor}
      pixelFormat="yuv"
    />
  );
}
```

### Modes

| `mode` | Returns |
|---|---|
| `'text'` | raw recognized text + blocks |
| `'card'` | `{ number, expiry?, holder? }` (Luhn-validated) |
| `'businessCard'` | `{ name?, company?, title?, phones[], emails[], website?, address? }` |
| `'receipt'` | `{ merchant?, date?, total?, currency? }` |
| `'mrz'` | passport/ID fields, checksum-validated |

### Result type

```ts
type OcrMode = 'text' | 'card' | 'businessCard' | 'receipt' | 'mrz';

interface OcrResult {
  /** Raw recognized text (always present). */
  text: string;

  card?: { number: string; expiry?: string; holder?: string };

  businessCard?: {
    name?: string; company?: string; title?: string;
    phones: string[]; emails: string[]; website?: string; address?: string;
  };

  receipt?: { merchant?: string; date?: string; total?: number; currency?: string };

  mrz?: {
    documentType: string; documentNumber: string;
    firstName?: string; lastName?: string; nationality?: string;
    birthDate?: string; expiryDate?: string; sex?: string;
    /** true when the MRZ check digits validate. */
    valid: boolean;
  };
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

- [ ] MRZ mode (first — checksum self-validates)
- [ ] Credit card mode (number + expiry, Luhn)
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
