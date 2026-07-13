# How Scanning Works

Every scan mode shares one pipeline; only the parsing layer differs. This page walks the full flow, then each mode in order: **passport (MRZ) → credit card → business card**.

## The shared pipeline

```
Camera (vision-camera)
  → onFrame worklet            … your code, throttled (e.g. every 5th frame)
  → scan(frame)                … native OCR: Apple Vision / ML Kit
      · crops to the central band (roi: 'centralBand' default)
      · returns text lines, top-to-bottom, left-to-right within a row
  → scheduleOnRN(lines)        … hand off to the JS thread
  → parseXxx(lines)            … mode parser (TS) → structured fields
  → session.push(parsed)       … multi-frame confirmation
  → final result               … render / autofill
```

Key properties:

- **Native does OCR only.** `scan()` runs real OCR on every call (hundreds of ms) with no hidden throttling — you decide the cadence in the worklet. All structuring happens in TypeScript.
- **One frame is never trusted.** Every mode ships a scan session that only confirms a result once frames **agree**, so a single misread ("HONG" → "HONO") never surfaces.
- **`frame.dispose()` in `finally`.** A leaked frame stalls the camera pipeline.

```tsx
const scanner = useMemo(() => getOcrScanner(), []);
const session = useMemo(() => createMrzScanSession(), []); // per mode

const frameOutput = useFrameOutput({
  pixelFormat: 'yuv',
  onFrame: (frame) => {
    'worklet';
    try {
      const g = globalThis as unknown as { __ocrFrameCount?: number };
      g.__ocrFrameCount = (g.__ocrFrameCount ?? 0) + 1;
      if (g.__ocrFrameCount % 5 !== 0) return;
      const ocr = scanner.scan(frame);
      if (ocr.lines.length > 0) scheduleOnRN(onLines, ocr.lines, ocr.lineItems);
    } finally {
      frame.dispose();
    }
  },
});
```

## 1. Passport (MRZ)

```
lines → parseMrz() → MrzResult → createMrzScanSession()
```

- `parseMrz` finds the two/three `<<<`-filled MRZ lines, parses them (ICAO 9303), and verifies the **check digits** — document number, birth date, and expiry each carry one, so a read can prove itself correct.
- `MrzResult.valid` = composite checksum passed; `fieldsValid` = the reported fields' own digits passed (OCR noise in unused filler often breaks only the composite).
- The session accepts a read only when its field checksums pass, confirms after `minReads` (default 3) agreeing reads, and takes the **name by majority vote** — names have no check digit.

MRZ is first for a reason: the checksum makes it the one mode where free on-device OCR can be *provably* right. See [MRZ Scanning](/guide/mrz).

## 2. Credit card

```
lines → parseCard() → CardResult → createCardScanSession()
```

- `parseCard` anchors on the **card number**: digit runs are windowed along group boundaries and must pass a brand check (BIN ranges) or the **Luhn checksum**. Expiry prefers a labeled date ("VALID THRU"); holder name is best-effort.
- `CardResult.valid` = Luhn passed. The session requires the same Luhn-valid number to repeat, then votes on expiry/name.
- No native changes were needed for this mode — it reuses the same `scan()` output. See [Credit Card Scanning](/guide/card).

## 3. Business card

```
lines → parseBusinessCard() → BusinessCardResult → createBusinessCardScanSession()
```

- A business card has **nothing to checksum**, so the anchor flips to contact info: `parseBusinessCard` returns `null` unless an email, phone, or website is found. There is no `valid` flag.
- Strong-pattern fields (email, phones with conservative type labels, website, address with continuation-line merging) are extracted first; **name/company/title** are heuristics: name shape + surname boost, legal suffix / domain-label / logo-text company, keyword titles plus an **elimination fallback** (the short line next to the name that nothing else explains) with departments split out.
- The session anchors on the contact identity (email, else phone digits) repeating — default `minReads: 2` — and votes the unchecked fields.

See [Business Card Scanning](/guide/business-card).

## Auto-detect

`detectDocument(lines)` runs the parsers in confidence order:

1. **Valid MRZ** (checksum) → `{ type: 'mrz', valid: true }`
2. **Luhn-valid card** → `{ type: 'card', valid: true }`
3. Structurally-parsed MRZ, then card, with `valid: false`
4. **Business card, only if an email is present** → `{ type: 'bizcard' }` — a phone number alone would false-positive on receipts and posters.

When your screen already knows what it's scanning, call the specific parser instead — fewer false positives and a mode-specific guide box.
