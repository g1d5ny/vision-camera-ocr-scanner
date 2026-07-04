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
// Standard MRZ formats: line width + number of lines. Widest first (TD3 preferred).
const MRZ_FORMATS: ReadonlyArray<{ width: number; lines: number }> = [
  { width: 44, lines: 2 }, // TD3 (passport)
  { width: 36, lines: 2 }, // TD2
  { width: 30, lines: 3 }, // TD1
];

/** Uppercase + strip whitespace. */
function clean(line: string): string {
  return line.toUpperCase().replace(/\s+/g, '');
}

/**
 * Snap a near-width line to an exact MRZ width (pad `<` / truncate).
 * Used ONLY as a fallback — exact-length lines are always tried first, because
 * padding/truncating can shift fields and produce a plausible-but-wrong parse.
 */
function snap(line: string, width: number): string {
  if (line.length === width) return line;
  if (line.length < width) return line.padEnd(width, '<');
  return line.slice(0, width);
}

function mapResult(
  result: ReturnType<typeof parse>,
  lines: string[]
): MrzResult {
  const f = result.fields;
  return {
    valid: result.valid,
    format: result.format,
    documentNumber: result.documentNumber ?? f.documentNumber ?? null,
    firstName: f.firstName ?? null,
    lastName: f.lastName ?? null,
    nationality: f.nationality ?? null,
    issuingState: f.issuingState ?? null,
    birthDate: f.birthDate ?? null,
    expirationDate: f.expirationDate ?? null,
    sex: f.sex ?? null,
    lines,
  };
}

/**
 * Parse a candidate line group. Returns the result plus a quality score
 * (checksum-valid = +2, has a name = +1), or null if it can't be parsed.
 */
function tryGroup(
  lines: string[]
): { result: MrzResult; score: number } | null {
  try {
    const result = parse(lines, { autocorrect: true });
    const documentNumber =
      result.documentNumber ?? result.fields.documentNumber ?? null;
    if (documentNumber == null) return null;
    const hasName = Boolean(result.fields.firstName || result.fields.lastName);
    const score = (result.valid ? 2 : 0) + (hasName ? 1 : 0);
    return { result: mapResult(result, lines), score };
  } catch {
    return null;
  }
}

/**
 * Extract MRZ-looking candidate lines (upper-case `A–Z 0–9 <`, near a standard
 * width), preserving OCR order. Does not alter line content.
 */
export function extractMrzLines(lines: string[]): string[] {
  return lines
    .map(clean)
    .filter(
      (line) =>
        line.length > 0 &&
        MRZ_CHARS.test(line) &&
        MRZ_FORMATS.some((format) => Math.abs(line.length - format.width) <= 2)
    );
}

/**
 * Parse MRZ fields from OCR text lines.
 *
 * Scans every window of consecutive candidate lines for each format and keeps
 * the best parse (prefers checksum-valid + named), so an extra MRZ-width line
 * from noisy OCR doesn't cause the wrong pair to be chosen. Exact-width lines
 * are tried first; padding/truncation is only a fallback.
 *
 * Returns `null` when nothing parses. A returned result may have `valid: false`
 * when the structure parsed but a check digit failed.
 */
export function parseMrz(inputLines: string[]): MrzResult | null {
  const candidates = extractMrzLines(inputLines);
  if (candidates.length < 2) return null;

  let best: { result: MrzResult; score: number } | null = null;

  for (const { width, lines: need } of MRZ_FORMATS) {
    for (let i = 0; i + need <= candidates.length; i++) {
      const window = candidates.slice(i, i + need);
      if (!window.every((line) => Math.abs(line.length - width) <= 2)) continue;

      const attempts = [window];
      if (!window.every((line) => line.length === width)) {
        attempts.push(window.map((line) => snap(line, width)));
      }
      for (const group of attempts) {
        const scored = tryGroup(group);
        if (scored != null && (best == null || scored.score > best.score)) {
          best = scored;
        }
        // valid + named is as good as it gets — stop early.
        if (best != null && best.score >= 3) return best.result;
      }
    }
  }
  return best?.result ?? null;
}
