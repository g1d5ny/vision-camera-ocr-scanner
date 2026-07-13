import { parseMrz, type MrzResult } from './parseMrz';
import { parseCard, type CardResult } from './parseCard';
import {
  parseBusinessCard,
  type BusinessCardResult,
} from './parseBusinessCard';
import type { OcrLine } from './VisionCameraOcrScanner.nitro';

/** Auto-detection result: a discriminated union over the document type. */
export type DetectedDocument =
  | { type: 'mrz'; valid: boolean; data: MrzResult }
  | { type: 'card'; valid: boolean; data: CardResult }
  | { type: 'bizcard'; data: BusinessCardResult };

/**
 * Auto-detect the document type from OCR lines by running the parsers.
 *
 * MRZ wins when ambiguous: its fixed-width `<<<` structure is far more specific
 * than a bare card number, and its checksum is stronger than Luhn (which a
 * random 16-digit run passes ~10% of the time). A checksum/Luhn-valid result
 * always beats a structurally-parsed-but-invalid one.
 *
 * A business card is the last resort and only when an **email** is present —
 * a phone number alone would make receipts, posters, and storefronts "detect"
 * as business cards, but an email plus no self-validating document is a
 * strong business-card signal. (The `bizcard` arm has no `valid` flag; there
 * is nothing to checksum.)
 *
 * Returns `null` when no parser finds a document. This is a convenience for
 * "scan any document" flows — when your flow already knows the type, call
 * the specific parser directly (fewer false positives, mode-specific UI).
 */
export function detectDocument(
  lines: string[],
  lineItems?: OcrLine[]
): DetectedDocument | null {
  const mrz = parseMrz(lines);
  if (mrz?.valid) return { type: 'mrz', valid: true, data: mrz };

  const card = parseCard(lines);
  if (card?.valid) return { type: 'card', valid: true, data: card };

  // Neither self-validated. MRZ's structure is far less likely to be a false
  // positive than a Luhn-failing card, so prefer it.
  if (mrz != null) return { type: 'mrz', valid: false, data: mrz };
  if (card != null) return { type: 'card', valid: false, data: card };

  const bizcard = parseBusinessCard(lines, lineItems);
  if (bizcard?.email != null) return { type: 'bizcard', data: bizcard };
  return null;
}
