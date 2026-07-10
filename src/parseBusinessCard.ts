/** One phone number found on a business card. */
export interface BusinessCardPhone {
  /**
   * 'mobile' | 'tel' | 'fax' only when a strong signal marks it — an explicit
   * label ("M.", "Tel:", "Fax", "휴대폰") or a Korean 010 mobile prefix.
   * 'unknown' otherwise; guessing from weak signals would bake misreads into
   * the API.
   */
  type: 'mobile' | 'tel' | 'fax' | 'unknown';
  /** The number as printed, label stripped. */
  number: string;
}

/**
 * Structured result of a parsed business card.
 *
 * Unlike MRZ and payment cards, a business card carries nothing to checksum,
 * so there is no `valid` field — every field is best-effort. Judge a result
 * by the fields your flow needs (e.g. require `email` or a phone).
 */
export interface BusinessCardResult {
  name: string | null;
  company: string | null;
  jobTitle: string | null;
  /** Organizational unit ("Technical R&D", "기술개발팀") when distinct from the title. */
  department: string | null;
  phones: BusinessCardPhone[];
  email: string | null;
  website: string | null;
  address: string | null;
  /** The OCR lines that were scanned. */
  lines: string[];
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/;

// Explicit scheme/www first; bare domains only as fallback (too noisy alone).
const WEBSITE_EXPLICIT = /(?:https?:\/\/|www\.)[^\s,]+/i;
const WEBSITE_BARE =
  /\b[a-z0-9-]{2,}(?:\.[a-z0-9-]{2,})*\.(?:com|net|org|io|co|kr|ai|dev|app)\b(?:\/\S*)?/i;

// A phone-shaped run: digits joined by spaces/dots/dashes/parens, optionally
// with a leading +country code. Digit count is checked separately.
const PHONE_RUN = /\+?\d[\d\s().-]{5,18}\d/g;
const DATE_SHAPED = /^\d{4}[.\-/]\s?\d{1,2}[.\-/]\s?\d{1,2}$/;

const COMPANY_SUFFIX =
  /주식회사|\(주\)|㈜|\b(?:co\.?,?\s?ltd|ltd|inc|corp(?:oration)?|llc|gmbh)\b\.?/i;

// Korean job titles, longest first so 대표이사 wins over 이사. \b doesn't
// work with Hangul, so these match by inclusion.
const KR_TITLES = [
  '대표이사',
  '부사장',
  '본부장',
  '센터장',
  '지점장',
  '연구원',
  '개발자',
  '엔지니어',
  '디자이너',
  '매니저',
  '사장',
  '전무',
  '상무',
  '이사',
  '부장',
  '차장',
  '과장',
  '대리',
  '주임',
  '팀장',
  '실장',
  '소장',
  '부대표',
  '파트장',
  '그룹장',
  '총괄',
  '책임',
  '선임',
  '수석',
  '사원',
  '대표',
];
const EN_TITLE =
  /\b(?:chief\s+\w+\s+officer|ceo|cto|cfo|coo|cmo|co-?founder|founder|president|vice\s+president|vp|director|general\s+manager|manager|team\s+lead|lead|head\s+of\s+\w+|engineer|developer|designer|researcher|consultant|architect)\b/i;

// Organizational-unit markers — a line carrying one reads as a department
// ("Technical R&D", "기술개발팀"), not a personal title.
const EN_ORG_UNIT =
  /\b(?:r&d|labs?|team|dept|department|division|center|centre|group|hq)\b/i;
const KR_ORG_SUFFIX = /(?:팀|본부|실|파트|센터|랩|사업부|연구소|그룹)$/;

const KR_NAME = /^[가-힣]{2,4}$/;
// 2-3 capitalized words, no digits — "Gildong Hong", "JANE DOE", "O'Neil".
const EN_NAME = /^[A-Z][A-Za-z.'-]{1,19}(?: [A-Z][A-Za-z.'-]{1,19}){1,2}$/;

const KR_ADDRESS =
  /[가-힣]+(?:특별시|광역시|시|도|구|군)\s|[가-힣]+[로길]\s?\d|\d+\s?(?:층|호)(?:\s|,|$)/;
const EN_ADDRESS =
  /\d+[^,]*\b(?:street|st\.|avenue|ave\.?|road|rd\.?|boulevard|blvd\.?|drive|dr\.|lane|suite|ste\.?|floor|fl\.)/i;

/** Digits (plus a leading +) only — the comparison/dedup form of a number. */
function normalizePhone(printed: string): string {
  const digits = printed.replace(/[^\d]/g, '');
  return printed.trimStart().startsWith('+') ? `+${digits}` : digits;
}

function findPhones(lines: string[]): BusinessCardPhone[] {
  const phones: BusinessCardPhone[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    PHONE_RUN.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = PHONE_RUN.exec(line)) != null) {
      const printed = m[0].trim();
      const normalized = normalizePhone(printed);
      const digitCount = normalized.replace(/\D/g, '').length;
      if (digitCount < 8 || digitCount > 15) continue;
      if (DATE_SHAPED.test(printed)) continue;

      // The label (if any) sits immediately before the number on the line.
      const before = line.slice(Math.max(0, m.index - 14), m.index);
      // Business-registration numbers are phone-shaped but labeled.
      if (/사업자|등록번호|reg(?:istration)?\.?\s*(?:no)?/i.test(before)) {
        continue;
      }
      if (seen.has(normalized)) continue;
      seen.add(normalized);

      let type: BusinessCardPhone['type'] = 'unknown';
      if (/(?:^|[^A-Za-z가-힣])(?:f|fax|팩스)\s*[.:)]?\s*$/i.test(before)) {
        type = 'fax';
      } else if (
        /(?:^|[^A-Za-z가-힣])(?:m|mob|mobile|cell|hp|휴대폰|핸드폰|모바일)\s*[.:)]?\s*$/i.test(
          before
        )
      ) {
        type = 'mobile';
      } else if (
        /(?:^|[^A-Za-z가-힣])(?:t|tel|phone|office|전화|직통|대표)\s*[.:)]?\s*$/i.test(
          before
        )
      ) {
        type = 'tel';
      } else if (
        normalized.startsWith('010') ||
        normalized.startsWith('+8210')
      ) {
        // Korean mobile prefix is a strong signal even without a label.
        type = 'mobile';
      }
      phones.push({ type, number: printed });
    }
  }
  return phones;
}

function findWebsite(lines: string[]): string | null {
  // Strip emails first so "user@acme.com" can't double as a website.
  const stripped = lines.map((l) => l.replace(new RegExp(EMAIL, 'g'), ' '));
  for (const line of stripped) {
    const explicit = line.match(WEBSITE_EXPLICIT);
    if (explicit) return explicit[0].replace(/[),.;]+$/, '');
  }
  for (const line of stripped) {
    const bare = line.match(WEBSITE_BARE);
    // A bare domain equal to the email's domain is redundant noise unless
    // it's the only web presence — still useful, so keep it.
    if (bare) return bare[0].replace(/[),.;]+$/, '');
  }
  return null;
}

/**
 * Token-level Korean title match: exact or suffix ("선임연구원" ends with
 * "연구원"), so a compound title comes back whole and substrings inside other
 * words ("프로덕트" vs "프로") can't false-positive.
 */
function matchKrTitleToken(token: string): boolean {
  return KR_TITLES.some((kw) => token === kw || token.endsWith(kw));
}

// Words that commonly modify an English title ("Senior Engineer", "Head of
// Product Design") — used to decide whether a whole line is just a title.
const EN_TITLE_MODIFIERS =
  /^(?:(?:senior|junior|principal|staff|associate|assistant|deputy|executive|general|global|group|chief|vice|co|product|project|software|hardware|frontend|backend|full-?stack|mobile|web|data|ai|ml|ux|ui|design|engineering|technical|technology|research|development|quality|strategy|marketing|sales|business|operations|r&d|of|the|and|&)\s*)*$/i;

/** True for tokens naming an org unit rather than a person's rank. */
function isOrgUnitToken(token: string): boolean {
  if (matchKrTitleToken(token)) return false; // 실장/팀장 are titles, not units
  return EN_ORG_UNIT.test(token) || KR_ORG_SUFFIX.test(token);
}

function findJobTitle(
  lines: string[]
): { title: string; lineIndex: number; department: string | null } | null {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (EMAIL.test(line) || WEBSITE_EXPLICIT.test(line)) continue;
    const tokens = line.split(/\s+/);
    // Korean: return the whole printed token ("선임연구원", not "연구원").
    const krToken = tokens.find(matchKrTitleToken);
    if (krToken != null) {
      // "기술개발팀 팀장" carries the org unit next to the title.
      const department = tokens.find(isOrgUnitToken) ?? null;
      return { title: krToken, lineIndex: i, department };
    }
    const en = line.match(EN_TITLE);
    if (en != null) {
      // Return the full printed phrase ("Senior Engineer") when what's left
      // around the keyword is only title modifiers; otherwise just the
      // keyword (e.g. "Jane Doe, CEO" → "CEO").
      const rest = line
        .replace(en[0], ' ')
        .replace(/[,/|·.]/g, ' ')
        .trim();
      const wholeLineIsTitle =
        line.length <= 30 && EN_TITLE_MODIFIERS.test(rest);
      return {
        title: wholeLineIsTitle ? line.trim() : en[0],
        lineIndex: i,
        department: null,
      };
    }
  }
  return null;
}

function findCompany(lines: string[], email: string | null): string | null {
  for (const line of lines) {
    if (COMPANY_SUFFIX.test(line) && !EMAIL.test(line)) return line.trim();
  }
  // Fallback: a line that carries the email's second-level domain
  // ("jiwon@acme.com" → a line containing "acme").
  const sld = email?.split('@')[1]?.split('.')[0];
  if (sld != null && sld.length >= 3) {
    const needle = sld.toLowerCase();
    for (const line of lines) {
      if (EMAIL.test(line) || WEBSITE_EXPLICIT.test(line)) continue;
      if (line.toLowerCase().includes(needle)) return line.trim();
    }
  }
  return null;
}

function isNameCandidate(line: string): boolean {
  if (COMPANY_SUFFIX.test(line)) return false;
  if (EN_TITLE.test(line)) return false;
  if (line.split(/\s+/).some(matchKrTitleToken)) return false;
  return KR_NAME.test(line) || EN_NAME.test(line);
}

/** A Hangul name token inside a mixed line ("홍길동 Gildong Hong" → 홍길동). */
function nameTokenIn(line: string, company: string | null): string | null {
  // Lines carrying contact info, addresses, digits, or the company name are
  // full of short Hangul tokens that aren't names (강남구, 예제기술…).
  if (/[0-9@]/.test(line)) return null;
  if (COMPANY_SUFFIX.test(line) || WEBSITE_EXPLICIT.test(line)) return null;
  if (KR_ADDRESS.test(line) || EN_ADDRESS.test(line)) return null;
  for (const token of line.split(/\s+/)) {
    // 2-3 chars only: 4-char tokens next to a title are usually loanword
    // modifiers ("프로덕트 디자이너"), not the rare 4-char name — those still
    // match on their own line via KR_NAME.
    if (!/^[가-힣]{2,3}$/.test(token)) continue;
    if (matchKrTitleToken(token)) continue;
    if (company != null && company.includes(token)) continue;
    return token;
  }
  return null;
}

function findName(
  lines: string[],
  titleLineIndex: number,
  company: string | null
): { name: string; lineIndex: number } | null {
  // A Korean card often puts name and title on one line ("홍길동 대표").
  if (titleLineIndex >= 0) {
    const token = nameTokenIn(lines[titleLineIndex]!, company);
    if (token != null) return { name: token, lineIndex: titleLineIndex };
  }
  // Otherwise prefer the line adjacent to the title — that's where the name
  // sits on most layouts — then fall back to the first candidate anywhere.
  const order =
    titleLineIndex >= 0
      ? [titleLineIndex - 1, titleLineIndex + 1]
      : ([] as number[]);
  for (const i of order) {
    const line = lines[i]?.trim();
    if (line == null) continue;
    if (company != null && line === company) continue;
    if (isNameCandidate(line)) return { name: line, lineIndex: i };
    // Mixed Korean+English name lines ("홍길동 Gildong Hong") fail the
    // whole-line patterns; fish the Hangul name token out instead.
    const token = nameTokenIn(line, company);
    if (token != null) return { name: token, lineIndex: i };
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (company != null && line === company) continue;
    if (isNameCandidate(line)) return { name: line, lineIndex: i };
  }
  for (let i = 0; i < lines.length; i++) {
    const token = nameTokenIn(lines[i]!.trim(), company);
    if (token != null) return { name: token, lineIndex: i };
  }
  return null;
}

/**
 * Elimination fallback for the role line: on a business card, a short line
 * that is none of the strongly-patterned fields (contact / address / company /
 * name / keyword title) is very likely the title or department — that's how
 * "Technical R&D" or "Growth Hacker" get caught without a keyword list.
 *
 * Guards are deliberately strict (the multi-frame session can't save us here:
 * a tagline repeats on every frame, so a loose guard would vote itself in):
 * sentence-shaped and long lines are dropped, and a line with no org-unit
 * marker is only trusted when it sits right next to the name.
 */
function findRoleByElimination(
  lines: string[],
  used: Set<number>,
  nameLineIndex: number
): { text: string; isDepartment: boolean } | null {
  let best: { text: string; score: number; isDepartment: boolean } | null =
    null;
  for (let i = 0; i < lines.length; i++) {
    if (used.has(i)) continue;
    const line = lines[i]!.trim();
    if (line.length < 2 || line.length > 28) continue;
    if (/[0-9@]/.test(line)) continue;
    const tokens = line.split(/\s+/);
    if (tokens.length > 4) continue;
    // Slogans read like sentences; roles don't.
    if (/[.!?]$/.test(line) || (line.match(/,/g) ?? []).length >= 2) continue;
    if (KR_ADDRESS.test(line) || EN_ADDRESS.test(line)) continue;
    if (COMPANY_SUFFIX.test(line)) continue;

    const isDepartment = tokens.some(isOrgUnitToken);
    const distance = nameLineIndex >= 0 ? Math.abs(i - nameLineIndex) : 99;
    if (!isDepartment && distance !== 1) continue;

    const score =
      (isDepartment ? 2 : 0) +
      (distance === 1 ? 3 : distance === 2 ? 1 : 0) +
      (tokens.length <= 3 ? 1 : 0) -
      ((line.match(/[/|]/g) ?? []).length >= 2 ? 2 : 0);
    if (best == null || score > best.score) {
      best = { text: line, score, isDepartment };
    }
  }
  return best;
}

function findAddress(lines: string[]): string | null {
  let best: string | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!KR_ADDRESS.test(line) && !EN_ADDRESS.test(line)) continue;
    // Addresses are the longest lines on a card; longer match wins.
    if (best == null || line.length > best.length) best = line;
  }
  return best;
}

/**
 * Parse business-card fields from OCR text lines.
 *
 * Contact info is the anchor: returns `null` when no email, phone number, or
 * website is found (a text block with no way to reach anyone isn't a business
 * card). All fields are heuristic best-effort — there is nothing to checksum,
 * so pair this with `createBusinessCardScanSession` to reject one-frame
 * misreads.
 */
export function parseBusinessCard(
  inputLines: string[]
): BusinessCardResult | null {
  const email = inputLines.join(' ').match(EMAIL)?.[0] ?? null;
  const phones = findPhones(inputLines);
  const website = findWebsite(inputLines);
  if (email == null && phones.length === 0 && website == null) return null;

  const title = findJobTitle(inputLines);
  const company = findCompany(inputLines, email);
  const address = findAddress(inputLines);
  const nameHit = findName(inputLines, title?.lineIndex ?? -1, company);

  let jobTitle = title?.title ?? null;
  let department = title?.department ?? null;
  if (jobTitle == null || department == null) {
    // Mark every line already explained by a strong pattern; what's left is
    // the elimination candidate pool.
    const used = new Set<number>();
    inputLines.forEach((raw, i) => {
      if (
        EMAIL.test(raw) ||
        WEBSITE_EXPLICIT.test(raw) ||
        phones.some((p) => raw.includes(p.number)) ||
        (address != null && raw.trim() === address) ||
        (company != null && raw.trim() === company)
      ) {
        used.add(i);
      }
    });
    if (title != null) used.add(title.lineIndex);
    if (nameHit != null) used.add(nameHit.lineIndex);

    const role = findRoleByElimination(
      inputLines,
      used,
      nameHit?.lineIndex ?? -1
    );
    if (role != null) {
      if (role.isDepartment) {
        if (department == null) department = role.text;
      } else if (jobTitle == null) {
        jobTitle = role.text;
      }
    }
  }

  return {
    name: nameHit?.name ?? null,
    company,
    jobTitle,
    department,
    phones,
    email,
    website,
    address,
    lines: inputLines,
  };
}
