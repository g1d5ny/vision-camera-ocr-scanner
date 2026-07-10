# MRZ Scanning

MRZ is the **Machine Readable Zone** — the two `<<<`-filled lines at the bottom of a passport (and some ID cards). It follows the ICAO 9303 standard and includes **check digits**, so a read can be self-validated.

## How it works

```
camera frame → native OCR (Apple Vision / ML Kit) → text lines → parseMrz() (mrz + checksum)
```

- The native `scan(frame)` returns recognized text lines (sorted top-to-bottom, left-to-right within a row). It runs real OCR on every call — throttle calls in your worklet (e.g. every 5th frame). By default it recognizes only the central band of the frame; pass `{ roi: 'full' }` for the whole frame.
- `parseMrz(lines)` finds the MRZ lines, parses them with the [`mrz`](https://www.npmjs.com/package/mrz) library, and validates the check digits.

## Parsing API

```ts
import { parseMrz, extractMrzLines, type MrzResult } from '@jieonist/vision-camera-ocr-scanner';

const result = parseMrz(ocrTextLines); // MrzResult | null
```

### `MrzResult`

```ts
interface MrzResult {
  valid: boolean;          // true when the MRZ check digits validate
  format: string;          // 'TD1' | 'TD2' | 'TD3'
  documentNumber: string | null;
  firstName: string | null;
  lastName: string | null;
  nationality: string | null;
  issuingState: string | null;
  birthDate: string | null;      // raw YYMMDD
  expirationDate: string | null; // raw YYMMDD
  sex: string | null;
  lines: string[];               // the MRZ lines that were parsed
}
```

`parseMrz` scans consecutive candidate-line windows and returns the best parse (preferring checksum-valid + named), so an extra OCR line doesn't select the wrong pair. It returns `null` when no MRZ is found; a result may have `valid: false` when a check digit fails (e.g. a noisy read or a sample document).

::: warning Never log the result object
`MrzResult.lines` contains the raw MRZ lines — the passport number, birth date, and name in plain text. Logging the result whole (e.g. `console.log(result)`) leaks them into device logs and crash/analytics pipelines. Log only the fields you need (e.g. `result.valid`, `result.format`), and drop the result from state as soon as your flow is done.
:::

## Notes & limitations

- **Dates are raw `YYMMDD`** — interpret the century in your app (expiry is always future/20xx; a birth date can't be in the future).
- The iOS OCR currently assumes a **portrait back-camera** orientation.
- Accuracy is "good enough for autofill" — always let users confirm/edit; for certified KYC/liveness use a commercial SDK.
