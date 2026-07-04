/** Structured result of a parsed payment card. */
export interface CardResult {
  /** True when the card number passes the Luhn checksum (self-validating). */
  valid: boolean;
  /** Digits only, e.g. '4111111111111111'. */
  number: string | null;
  /** Grouped for display, e.g. '4111 1111 1111 1111' (Amex: 4-6-5). */
  numberFormatted: string | null;
  /** Detected brand: 'visa' | 'mastercard' | 'amex' | 'discover' | 'jcb' | 'diners' | 'unknown'. */
  brand: string | null;
  /** Expiry month as printed, 'MM'. */
  expiryMonth: string | null;
  /** Expiry year, two digits 'YY'. */
  expiryYear: string | null;
  /** Cardholder name if a plausible line was found (best-effort, may be null). */
  holderName: string | null;
  /** The OCR lines that were scanned. */
  lines: string[];
}

// A card-shaped region: 13-19 digits separated only by single spaces/dashes.
// Letters, slashes, etc. break a run, so dates / CVV / labels can't merge in.
const CARD_RUN = /(?:\d[ -]?){13,19}/g;
const CARD_LENGTHS = new Set([13, 14, 15, 16, 19]);

const NAME_STOPWORDS =
  /VALID|THRU|GOOD|MONTH|YEAR|MEMBER|SINCE|BANK|CARD|CREDIT|DEBIT|DATE|EXPIR|CVV|CVC/;

const EXPIRY = /(0[1-9]|1[0-2])\s*\/\s*(\d{2})(?!\d)/g;
const EXPIRY_LABEL = /(VALID|GOOD)\s*(THRU|THROUGH)|EXP/i;

/** Luhn (mod-10) checksum. */
function luhnValid(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48; // '0'
    if (d < 0 || d > 9) return false;
    if (alt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alt = !alt;
  }
  return digits.length > 0 && sum % 10 === 0;
}

/** Identify the card brand from the number (BIN range + length), or 'unknown'. */
export function detectBrand(number: string): string {
  if (!/^\d+$/.test(number)) return 'unknown';
  const len = number.length;

  if (number[0] === '4' && (len === 13 || len === 16 || len === 19)) {
    return 'visa';
  }
  if (/^3[47]/.test(number) && len === 15) return 'amex';
  if (/^(30[0-5]|3[689])/.test(number) && len === 14) return 'diners';
  if (/^35(2[89]|[3-8]\d)/.test(number) && len === 16) return 'jcb'; // 3528–3589

  if (len === 16) {
    if (/^5[1-5]/.test(number)) return 'mastercard';
    const bin = parseInt(number.slice(0, 6), 10);
    if (bin >= 222100 && bin <= 272099) return 'mastercard'; // 2-series
  }
  if (len >= 16 && len <= 19) {
    if (/^(6011|65|64[4-9])/.test(number)) return 'discover';
    const bin = parseInt(number.slice(0, 6), 10);
    if (bin >= 622126 && bin <= 622925) return 'discover'; // UnionPay-overlap range
  }
  return 'unknown';
}

/**
 * Find the card number. Only considers group-aligned windows inside a
 * card-shaped run (so digit soup from dates/CVV/labels can't form a number),
 * and requires each candidate to carry at least one signal (a known brand or a
 * valid Luhn). The longest such candidate wins — a real PAN is the longest
 * card-shaped number present — with brand + Luhn breaking ties. This surfaces a
 * slightly-misread card (valid: false) instead of a coincidental sub-number.
 */
function findCardNumber(lines: string[]): string | null {
  const runs: string[] = [];
  for (const src of [...lines, lines.join(' ')]) {
    const matched = src.match(CARD_RUN);
    if (matched != null) runs.push(...matched);
  }

  let best: { number: string; len: number; score: number } | null = null;
  for (const run of runs) {
    const groups = run.split(/[ -]+/).filter(Boolean); // pure-digit groups
    for (let start = 0; start < groups.length; start++) {
      let acc = '';
      for (let end = start; end < groups.length; end++) {
        acc += groups[end];
        if (acc.length > 19) break;
        if (!CARD_LENGTHS.has(acc.length)) continue;
        const known = detectBrand(acc) !== 'unknown';
        const luhn = luhnValid(acc);
        if (!known && !luhn) continue;
        const score = (known ? 2 : 0) + (luhn ? 1 : 0);
        if (
          best == null ||
          acc.length > best.len ||
          (acc.length === best.len && score > best.score)
        ) {
          best = { number: acc, len: acc.length, score };
        }
      }
    }
  }
  return best?.number ?? null;
}

/**
 * Find the expiry date (MM/YY). Prefers a date next to an expiry label
 * ("VALID THRU" / "EXP"); otherwise the latest date wins, so an Amex "member
 * since" doesn't beat "valid thru". Dates that sit inside a longer number are
 * rejected.
 */
function findExpiry(lines: string[]): { month: string; year: string } | null {
  const text = lines.join('  ');
  let best: {
    month: string;
    year: string;
    labeled: boolean;
    key: number;
  } | null = null;

  EXPIRY.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = EXPIRY.exec(text)) != null) {
    const idx = m.index;
    if (idx > 0 && /\d/.test(text[idx - 1]!)) continue; // part of a longer number
    const month = m[1]!;
    const year = m[2]!;
    const labeled = EXPIRY_LABEL.test(text.slice(Math.max(0, idx - 12), idx));
    const key = parseInt(year, 10) * 100 + parseInt(month, 10);
    if (
      best == null ||
      (labeled && !best.labeled) ||
      (labeled === best.labeled && key > best.key)
    ) {
      best = { month, year, labeled, key };
    }
  }
  return best ? { month: best.month, year: best.year } : null;
}

/** Best-effort cardholder name: an all-letters, multi-word line that isn't a label. */
function findHolderName(lines: string[]): string | null {
  for (const raw of lines) {
    const line = raw.trim();
    if (!/^[A-Za-z][A-Za-z .'-]{4,30}$/.test(line)) continue;
    if (line.split(/\s+/).length < 2) continue;
    if (NAME_STOPWORDS.test(line.toUpperCase())) continue;
    return line.toUpperCase();
  }
  return null;
}

/** Group digits for display (Amex 4-6-5, everything else 4-4-4-4…). */
function formatNumber(number: string, brand: string): string {
  if (brand === 'amex' && number.length === 15) {
    return `${number.slice(0, 4)} ${number.slice(4, 10)} ${number.slice(10)}`;
  }
  return number.replace(/(.{4})/g, '$1 ').trim();
}

/**
 * Parse payment-card fields from OCR text lines.
 *
 * The card number is the anchor: returns `null` when no plausible number is
 * found. `valid` reflects the Luhn checksum, so a returned result may have
 * `valid: false` on a noisy read. Expiry and holder name are best-effort.
 */
export function parseCard(inputLines: string[]): CardResult | null {
  const number = findCardNumber(inputLines);
  if (number == null) return null;

  const brand = detectBrand(number);
  const expiry = findExpiry(inputLines);
  return {
    valid: luhnValid(number),
    number,
    numberFormatted: formatNumber(number, brand),
    brand,
    expiryMonth: expiry?.month ?? null,
    expiryYear: expiry?.year ?? null,
    holderName: findHolderName(inputLines),
    lines: inputLines,
  };
}
