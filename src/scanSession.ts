import type { CardResult } from './parseCard';
import type { MrzResult } from './parseMrz';

/**
 * Multi-frame scan sessions.
 *
 * A single OCR frame is not trustworthy: checksummed fields (card number,
 * MRZ document number / dates) can be verified per frame, but names have no
 * check digit, so a one-frame misread ("HONG" → "HONO") passes silently.
 * A session accumulates per-frame parses and only emits a result when the
 * checksummed identity has repeated, taking unchecked fields by majority —
 * and holding out for a name that repeats before trusting it.
 */
export interface ScanSessionOptions {
  /** Reads with the same checksummed identity required to accept. Default 3. */
  minReads?: number;
  /**
   * Once the identity is stable, keep scanning up to this many reads for a
   * name that repeats; after that, accept with the best guess (or null).
   * Default 8.
   */
  maxReads?: number;
  /** Rolling window of recent valid reads to vote over. Default 12. */
  windowSize?: number;
  /**
   * When false, reads are accepted without their checksum passing (Luhn /
   * MRZ check digits) — stability still comes from `minReads` identical
   * reads. Use for specimen documents or IDs with non-standard check
   * digits; check `valid` on the result to surface the difference.
   * Default true.
   */
  requireChecksum?: boolean;
}

export interface ScanSession<T> {
  /**
   * Feed one frame's parse. Returns the finalized result once the session
   * is confident, `null` while it needs more frames.
   */
  push(parsed: T | null): T | null;
  /** Drop all accumulated reads (e.g. on rescan or mode switch). */
  reset(): void;
}

interface Majority<T> {
  item: T;
  count: number;
}

function majority<T>(
  items: T[],
  keyOf: (item: T) => string | null
): Majority<T> | null {
  const counts = new Map<string, Majority<T>>();
  let best: Majority<T> | null = null;
  for (const item of items) {
    const key = keyOf(item);
    if (key == null) continue;
    const entry = counts.get(key) ?? { item, count: 0 };
    entry.count++;
    counts.set(key, entry);
    // >= so ties go to the key whose count grew most recently — later reads
    // tend to come from better-aligned frames. (The representative item stays
    // the key's first occurrence; same key means the same value, so which
    // occurrence wins doesn't matter.)
    if (best == null || entry.count >= best.count) best = entry;
  }
  return best;
}

function createSession<T>(
  options: ScanSessionOptions,
  isAcceptableRead: (parsed: T) => boolean,
  identityOf: (parsed: T) => string,
  finalize: (agreeing: T[], settled: boolean) => T | null
): ScanSession<T> {
  const minReads = options.minReads ?? 3;
  const maxReads = options.maxReads ?? 8;
  const windowSize = options.windowSize ?? 12;
  let window: T[] = [];

  return {
    push(parsed: T | null): T | null {
      if (parsed == null || !isAcceptableRead(parsed)) return null;
      window.push(parsed);
      if (window.length > windowSize) window.shift();

      const identity = identityOf(parsed);
      const agreeing = window.filter((r) => identityOf(r) === identity);
      if (agreeing.length < minReads) return null;

      const result = finalize(agreeing, agreeing.length >= maxReads);
      if (result != null) window = [];
      return result;
    },
    reset() {
      window = [];
    },
  };
}

/**
 * Card scan session: accepts once the same Luhn-valid number has been read
 * `minReads` times. The holder name and expiry are taken by majority among
 * those reads; a name is only trusted once it has repeated, otherwise the
 * session keeps scanning (up to `maxReads`) before settling.
 */
export function createCardScanSession(
  options: ScanSessionOptions = {}
): ScanSession<CardResult> {
  return createSession<CardResult>(
    options,
    (r) => r.number != null && (r.valid || options.requireChecksum === false),
    (r) => r.number!,
    (agreeing, settled) => {
      const name = majority(agreeing, (r) => r.holderName);
      const expiry = majority(agreeing, (r) =>
        r.expiryMonth ? `${r.expiryMonth}/${r.expiryYear}` : null
      );
      // A name seen only once is as likely a misread as not — wait for a
      // repeat unless we've hit the read budget.
      if (name != null && name.count < 2 && !settled) return null;
      const base = agreeing[agreeing.length - 1]!;
      return {
        ...base,
        holderName:
          name != null && name.count >= 2 ? name.item.holderName : null,
        expiryMonth: expiry?.item.expiryMonth ?? null,
        expiryYear: expiry?.item.expiryYear ?? null,
      };
    }
  );
}

/**
 * MRZ scan session: accepts once `minReads` parses whose field check digits
 * pass (`fieldsValid` — document number, birth date, expiration date) agree
 * on those fields. Full `valid` is not required: OCR noise in the unused
 * optional-data field breaks the composite digit on most frames while the
 * fields we report are provably intact. The name field has no check digit,
 * so it follows the same repeat-before-trust policy as cards — except a
 * name is never dropped to null (MRZs always carry one), so after
 * `maxReads` the most frequent spelling wins.
 */
export function createMrzScanSession(
  options: ScanSessionOptions = {}
): ScanSession<MrzResult> {
  return createSession<MrzResult>(
    options,
    (r) =>
      r.documentNumber != null &&
      (r.fieldsValid || options.requireChecksum === false),
    (r) => `${r.documentNumber}|${r.birthDate}|${r.expirationDate}`,
    (agreeing, settled) => {
      const name = majority(agreeing, (r) =>
        r.firstName || r.lastName ? `${r.firstName}|${r.lastName}` : null
      );
      if (name != null && name.count < 2 && !settled) return null;
      return name?.item ?? agreeing[agreeing.length - 1]!;
    }
  );
}
