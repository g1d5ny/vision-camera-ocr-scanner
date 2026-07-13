# Business Card Scanning

Point the camera at a business card to extract the **name**, **company**, **job title**, **phone numbers**, **email**, **website**, and **address**. Korean and English cards are supported.

## How it works

```
camera frame → native OCR (Apple Vision / ML Kit) → text lines → parseBusinessCard() (heuristics)
```

Like MRZ and cards, the native side does OCR only and returns text lines; `parseBusinessCard` runs on the JS thread. It has **no extra native dependency** — it reuses the same `scan(frame)`.

## Parsing API

```ts
import { parseBusinessCard, type BusinessCardResult } from '@jieonist/vision-camera-ocr-scanner';

const result = parseBusinessCard(ocrTextLines); // BusinessCardResult | null
```

### `BusinessCardResult`

```ts
interface BusinessCardResult {
  name: string | null;
  company: string | null;
  jobTitle: string | null;
  department: string | null;   // org unit ("Technical R&D", "기술개발팀")
  phones: BusinessCardPhone[]; // { type: 'mobile' | 'tel' | 'fax' | 'unknown', number: string }
  email: string | null;
  website: string | null;
  address: string | null;
  lines: string[];             // the OCR lines that were scanned
}
```

**Contact info is the anchor** — `parseBusinessCard` returns `null` when no email, phone, or website is found. A phone's `type` is only set from strong signals (an explicit label like `M.` / `Tel:` / `Fax`, or a Korean `010` mobile prefix); otherwise it stays `'unknown'` rather than guessing.

**Titles aren't dictionary-bound.** Known keywords (CEO, 팀장, Engineer…) match directly, and anything else is caught by **elimination**: a short line that is none of the strongly-patterned fields (contact, address, company, name) and sits next to the name is read as the role. Lines carrying an org-unit marker (R&D, Team, 본부, 팀…) land in `department`; slogans and sentence-shaped lines are rejected.

**Pass `lineItems` for layout signals.** `parseBusinessCard(lines, ocr.lineItems)` turns text size into evidence — the tallest line is the name (big top text reads as the brand), an unexplained line taller than the name is the company logo, and a line printed larger than the name can't be a title.

::: info No `valid` field
Unlike MRZ (check digits) and payment cards (Luhn), a business card carries **nothing to checksum**, so there is no `valid` flag — every field is best-effort. Judge a result by the fields your flow needs (e.g. require `email` or a phone), and use the scan session below to reject one-frame misreads.
:::

## Multi-frame session

```ts
import { createBusinessCardScanSession } from '@jieonist/vision-camera-ocr-scanner';

const session = createBusinessCardScanSession(); // minReads defaults to 2

// in your onLines handler:
const final = session.push(parseBusinessCard(lines));
if (final != null) {
  // confirmed — the same contact identity repeated across frames
}
```

The session anchors on the **contact identity** (email, or the set of phone numbers) repeating across frames. Frames without an email or phone are dropped. Unchecked fields (name, company, title, address) are taken by majority vote, and a name is only trusted once it has repeated.

## Notes & limitations

- Heuristics favor **Korean and English** card layouts; other languages will mostly fall back to contact fields only.
- Stylized logos often OCR poorly — `company` may come from the legal-suffix line (주식회사 / Co., Ltd) or a line matching the email domain instead.
- Decorative fonts and vertical layouts reduce accuracy. Treat results as **autofill hints** and let users edit.
- In `detectDocument()`, a business card is the **guarded last resort**: it only detects when an **email** is present, after MRZ and card fail — a phone number alone would make almost any text block (receipts, posters) "detect" as a business card.
