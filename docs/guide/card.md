# Credit Card Scanning

Point the camera at a payment card to extract the **card number**, **brand**, **expiry**, and (best-effort) **cardholder name**. The card number is validated with the **Luhn checksum**, so a clean read is self-validating.

## How it works

```
camera frame → native OCR (Apple Vision / ML Kit) → text lines → parseCard() (Luhn + BIN)
```

Like MRZ, the native side does OCR only and returns text lines; `parseCard` runs on the JS thread. It has **no extra native dependency** — it reuses the same `scan(frame)`.

## Parsing API

```ts
import { parseCard, detectBrand, type CardResult } from '@jieonist/vision-camera-ocr-scanner';

const result = parseCard(ocrTextLines); // CardResult | null
```

### `CardResult`

```ts
interface CardResult {
  valid: boolean;              // true when the number passes the Luhn checksum
  number: string | null;       // digits only, e.g. '4111111111111111'
  numberFormatted: string | null; // grouped, e.g. '4111 1111 1111 1111' (Amex 4-6-5)
  brand: string | null;        // 'visa' | 'mastercard' | 'amex' | 'discover' | 'jcb' | 'diners' | 'unknown'
  expiryMonth: string | null;  // 'MM'
  expiryYear: string | null;   // 'YY'
  holderName: string | null;   // best-effort, may be null
  lines: string[];             // the OCR lines that were scanned
}
```

The **card number is the anchor** — `parseCard` returns `null` when no plausible number is found. It prefers a brand-known + Luhn-valid run, so a coincidentally-valid substring doesn't win over the real number. When several expiry dates appear (e.g. Amex "member since" + "valid thru"), the **latest** date is chosen.

`detectBrand(number)` is exported separately if you only need the brand from a known number.

::: warning Never log the result object
`CardResult.lines` contains the raw OCR lines — including the full card number (PAN). Logging the result whole (e.g. `console.log(result)`) leaks it into device logs and crash/analytics pipelines. Log only the fields you need (e.g. `result.valid`, `result.brand`), and drop the result from state as soon as your flow is done.
:::

## Notes & limitations

- **Cardholder name is best-effort.** Card fonts and embossing read poorly; treat it as a hint and let users edit.
- **Embossed (raised) numbers** scan worse than flat-printed ones — good lighting and a flat angle help a lot.
- `valid` reflects only the Luhn checksum — it does **not** mean the card is real, active, or authorized. Never use this for payment authorization; it's for autofill / data entry.
- iOS OCR currently assumes a **portrait back-camera** orientation.
