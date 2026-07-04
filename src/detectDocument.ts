import { parseMrz, type MrzResult } from './parseMrz';
import { parseCard, type CardResult } from './parseCard';

/** Auto-detection result: a discriminated union over the document type. */
export type DetectedDocument =
  | { type: 'mrz'; valid: boolean; data: MrzResult }
  | { type: 'card'; valid: boolean; data: CardResult };

/**
 * Auto-detect the document type from OCR lines by running both parsers.
 *
 * MRZ wins when ambiguous: its fixed-width `<<<` structure is far more specific
 * than a bare card number, and its checksum is stronger than Luhn (which a
 * random 16-digit run passes ~10% of the time). A checksum/Luhn-valid result
 * always beats a structurally-parsed-but-invalid one.
 *
 * Returns `null` when neither parser finds a document. This is a convenience
 * for "scan any document" flows — when your flow already knows the type, call
 * `parseMrz` / `parseCard` directly (fewer false positives, mode-specific UI).
 */
export function detectDocument(lines: string[]): DetectedDocument | null {
  const mrz = parseMrz(lines);
  if (mrz?.valid) return { type: 'mrz', valid: true, data: mrz };

  const card = parseCard(lines);
  if (card?.valid) return { type: 'card', valid: true, data: card };

  // Neither self-validated. MRZ's structure is far less likely to be a false
  // positive than a Luhn-failing card, so prefer it.
  if (mrz != null) return { type: 'mrz', valid: false, data: mrz };
  if (card != null) return { type: 'card', valid: false, data: card };
  return null;
}
