import { parse } from 'mrz';

/** Structured result of a parsed Machine Readable Zone (passport / ID). */
export interface MrzResult {
  /** True when the MRZ check digits validate (self-validating). */
  valid: boolean;
  /** MRZ document format, e.g. 'TD1' | 'TD2' | 'TD3'. */
  format: string;
  documentNumber: string | null;
  firstName: string | null;
  lastName: string | null;
  nationality: string | null;
  issuingState: string | null;
  /** Raw YYMMDD as printed in the MRZ. */
  birthDate: string | null;
  expirationDate: string | null;
  /** 'male' | 'female' | etc. as returned by the parser. */
  sex: string | null;
  /** The MRZ lines that were parsed. */
  lines: string[];
}

const MRZ_CHARS = /^[A-Z0-9<]+$/;
// Standard MRZ line widths, widest first: TD3 = 44, TD2 = 36, TD1 = 30.
const MRZ_WIDTHS = [44, 36, 30];

/**
 * Clean one OCR line and, if it is close to a standard MRZ width, snap it to
 * that exact width (the `mrz` parser requires exact line lengths, but OCR often
 * drops/adds a character or two). Returns null for non-MRZ lines.
 *
 * Note: only line 1 reliably contains the `<` filler — data lines can be fully
 * alphanumeric — so we do NOT require `<`.
 */
function normalizeLine(line: string): string | null {
  const clean = line.toUpperCase().replace(/\s+/g, '');
  if (clean.length === 0 || !MRZ_CHARS.test(clean)) return null;
  for (const width of MRZ_WIDTHS) {
    if (Math.abs(clean.length - width) <= 2) {
      if (clean.length < width) return clean.padEnd(width, '<');
      if (clean.length > width) return clean.slice(0, width);
      return clean;
    }
  }
  return null;
}

/** Extract normalized candidate MRZ lines from arbitrary OCR text lines. */
export function extractMrzLines(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    const normalized = normalizeLine(line);
    if (normalized != null) out.push(normalized);
  }
  return out;
}

/**
 * Parse MRZ fields from OCR text lines.
 *
 * Returns `null` when no MRZ can be parsed. A returned result may still have
 * `valid: false` when the structure parsed but a check digit failed.
 */
export function parseMrz(lines: string[]): MrzResult | null {
  const candidates = extractMrzLines(lines);
  if (candidates.length < 2) return null;

  for (const width of MRZ_WIDTHS) {
    const group = candidates.filter((line) => line.length === width);
    const need = width === 30 ? 3 : 2; // TD1 is 3 lines; TD2/TD3 are 2
    if (group.length < need) continue;

    // The MRZ block sits at the bottom of the document.
    const mrzLines = group.slice(-need);
    try {
      const result = parse(mrzLines, { autocorrect: true });
      const documentNumber =
        result.documentNumber ?? result.fields.documentNumber ?? null;
      if (documentNumber == null) continue;

      const fields = result.fields;
      return {
        valid: result.valid,
        format: result.format,
        documentNumber,
        firstName: fields.firstName ?? null,
        lastName: fields.lastName ?? null,
        nationality: fields.nationality ?? null,
        issuingState: fields.issuingState ?? null,
        birthDate: fields.birthDate ?? null,
        expirationDate: fields.expirationDate ?? null,
        sex: fields.sex ?? null,
        lines: mrzLines,
      };
    } catch {
      // Not a valid MRZ of this width — try the next width.
    }
  }
  return null;
}
