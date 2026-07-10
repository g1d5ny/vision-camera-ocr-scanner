import { describe, it, expect } from '@jest/globals';
import { parseBusinessCard } from '../parseBusinessCard';
import { createBusinessCardScanSession } from '../scanSession';

// Fixture data uses fictional specimen identities only.
const KOREAN_CARD = [
  '주식회사 예제기술',
  '홍길동',
  '대표이사',
  'T. 02-1234-5678',
  'M. 010-1234-5678',
  'F. 02-1234-5679',
  'gildong@example.com',
  'www.example.com',
  '서울특별시 강남구 테헤란로 123 4층',
];

const ENGLISH_CARD = [
  'ACME Co., Ltd.',
  'Jane Doe',
  'Chief Executive Officer',
  'Tel: +1 415 555 0100',
  'jane.doe@acme.example.com',
  'https://acme.example.com',
  '123 Market Street, Suite 400',
];

describe('parseBusinessCard', () => {
  it('parses a Korean business card', () => {
    const r = parseBusinessCard(KOREAN_CARD);
    expect(r).not.toBeNull();
    expect(r!.name).toBe('홍길동');
    expect(r!.company).toBe('주식회사 예제기술');
    expect(r!.jobTitle).toBe('대표이사');
    expect(r!.email).toBe('gildong@example.com');
    expect(r!.website).toBe('www.example.com');
    expect(r!.address).toBe('서울특별시 강남구 테헤란로 123 4층');
    expect(r!.phones).toEqual([
      { type: 'tel', number: '02-1234-5678' },
      { type: 'mobile', number: '010-1234-5678' },
      { type: 'fax', number: '02-1234-5679' },
    ]);
  });

  it('parses an English business card', () => {
    const r = parseBusinessCard(ENGLISH_CARD);
    expect(r).not.toBeNull();
    expect(r!.name).toBe('Jane Doe');
    expect(r!.company).toBe('ACME Co., Ltd.');
    expect(r!.jobTitle!.toLowerCase()).toBe('chief executive officer');
    expect(r!.email).toBe('jane.doe@acme.example.com');
    expect(r!.website).toBe('https://acme.example.com');
    expect(r!.address).toBe('123 Market Street, Suite 400');
    expect(r!.phones).toEqual([{ type: 'tel', number: '+1 415 555 0100' }]);
  });

  it('returns null when there is no contact info at all', () => {
    expect(parseBusinessCard(['홍길동', '대표이사'])).toBeNull();
    expect(parseBusinessCard([])).toBeNull();
  });

  it('marks an unlabeled 010 number as mobile (strong Korean prefix)', () => {
    const r = parseBusinessCard(['홍길동', '010-9876-5432']);
    expect(r!.phones).toEqual([{ type: 'mobile', number: '010-9876-5432' }]);
  });

  it('leaves an unlabeled non-mobile number as unknown', () => {
    const r = parseBusinessCard(['Jane Doe', '02-333-4444']);
    expect(r!.phones).toEqual([{ type: 'unknown', number: '02-333-4444' }]);
  });

  it('extracts the name from a combined name+title line', () => {
    const r = parseBusinessCard(['홍길동 대표', '010-1111-2222']);
    expect(r!.name).toBe('홍길동');
    expect(r!.jobTitle).toBe('대표');
  });

  it('skips business-registration numbers', () => {
    const r = parseBusinessCard([
      '사업자등록번호 123-45-67890',
      'M 010-2222-3333',
    ]);
    expect(r!.phones).toEqual([{ type: 'mobile', number: '010-2222-3333' }]);
  });

  it('skips date-shaped digit runs', () => {
    const r = parseBusinessCard(['2026-07-10', 'jane@acme.example.com']);
    expect(r!.phones).toEqual([]);
    expect(r!.email).toBe('jane@acme.example.com');
  });

  it('dedupes the same number printed twice', () => {
    const r = parseBusinessCard(['T 02-123-4567', 'Tel: 02-123-4567']);
    expect(r!.phones).toHaveLength(1);
  });

  it('does not mistake the email for a website', () => {
    const r = parseBusinessCard(['gildong@example.com']);
    expect(r!.website).toBeNull();
    expect(r!.email).toBe('gildong@example.com');
  });

  it('falls back to the email domain to find the company line', () => {
    const r = parseBusinessCard(['Acme Networks', 'jane@acme.example.com']);
    expect(r!.company).toBe('Acme Networks');
  });

  it('prefers the name adjacent to the title line', () => {
    const r = parseBusinessCard([
      'Jane Doe',
      'Senior Engineer',
      'Somewhere Plaza',
      'jane@acme.example.com',
    ]);
    expect(r!.name).toBe('Jane Doe');
    expect(r!.jobTitle!.toLowerCase()).toBe('senior engineer');
  });

  it('pulls the Hangul name out of a mixed Korean+English line', () => {
    const r = parseBusinessCard(['홍길동 Gildong Hong', '010-1234-5678']);
    expect(r!.name).toBe('홍길동');
  });

  it('returns a compound Korean title whole', () => {
    const r = parseBusinessCard(['김철수', '선임연구원', '010-1234-5678']);
    expect(r!.jobTitle).toBe('선임연구원');
    expect(r!.name).toBe('김철수');
  });

  it('matches a Korean title by token, not substring', () => {
    // '프로덕트' must not match a '프로'-style keyword; '디자이너' is the title.
    const r = parseBusinessCard([
      '김철수',
      '프로덕트 디자이너',
      '010-1234-5678',
    ]);
    expect(r!.jobTitle).toBe('디자이너');
    expect(r!.name).toBe('김철수');
  });

  it('does not mistake a job word for a name', () => {
    const r = parseBusinessCard(['소프트웨어 엔지니어', '010-1234-5678']);
    expect(r!.jobTitle).toBe('엔지니어');
    expect(r!.name).toBeNull();
  });

  it('captures a department-style role line like "Technical R&D"', () => {
    const r = parseBusinessCard([
      'Jane Doe',
      'Technical R&D',
      'jane@acme.example.com',
    ]);
    expect(r!.department).toBe('Technical R&D');
    expect(r!.jobTitle).toBeNull();
    expect(r!.name).toBe('Jane Doe');
  });

  it('catches an out-of-dictionary title next to the name by elimination', () => {
    const r = parseBusinessCard([
      'Jane Doe',
      'Growth Hacker',
      'jane@acme.example.com',
    ]);
    expect(r!.jobTitle).toBe('Growth Hacker');
  });

  it('does not mistake a slogan for a role', () => {
    const r = parseBusinessCard([
      'Jane Doe',
      'We build the future of everything today',
      'jane@acme.example.com',
    ]);
    expect(r!.jobTitle).toBeNull();
    expect(r!.department).toBeNull();
  });

  it('splits department and title from a combined Korean line', () => {
    const r = parseBusinessCard(['홍길동', '기술개발팀 팀장', '010-1234-5678']);
    expect(r!.jobTitle).toBe('팀장');
    expect(r!.department).toBe('기술개발팀');
    expect(r!.name).toBe('홍길동');
  });

  it('ignores a far-from-name unknown line (no org marker)', () => {
    const r = parseBusinessCard([
      'Jane Doe',
      'Senior Engineer',
      'Best Quality Since 1999?',
      'Somewhere Plaza',
      'jane@acme.example.com',
    ]);
    // 'Somewhere Plaza' is 3 lines from the name and carries no org marker.
    expect(r!.department).toBeNull();
  });
});

describe('createBusinessCardScanSession', () => {
  const read = (over: Partial<ReturnType<typeof base>> = {}) => ({
    ...base(),
    ...over,
  });
  const base = () => ({
    name: '홍길동' as string | null,
    company: '주식회사 예제기술' as string | null,
    jobTitle: '대표이사' as string | null,
    department: null as string | null,
    phones: [{ type: 'mobile' as const, number: '010-1234-5678' }],
    email: 'gildong@example.com' as string | null,
    website: null as string | null,
    address: null as string | null,
    lines: [] as string[],
  });

  it('confirms after two reads with the same email identity', () => {
    const session = createBusinessCardScanSession();
    expect(session.push(read())).toBeNull();
    const final = session.push(read());
    expect(final).not.toBeNull();
    expect(final!.name).toBe('홍길동');
    expect(final!.company).toBe('주식회사 예제기술');
  });

  it('drops frames without an email or phone anchor', () => {
    const session = createBusinessCardScanSession();
    const anchorless = read({ email: null, phones: [] });
    expect(session.push(anchorless)).toBeNull();
    expect(session.push(anchorless)).toBeNull();
    expect(session.push(anchorless)).toBeNull();
  });

  it('withholds a name that never repeats until maxReads settles it', () => {
    const session = createBusinessCardScanSession({ maxReads: 3 });
    expect(session.push(read({ name: '홍길동' }))).toBeNull();
    // Same identity but a different (misread) name: no repeat yet, so the
    // session keeps waiting even though minReads identities agree.
    expect(session.push(read({ name: '홍길둥' }))).toBeNull();
    const final = session.push(read({ name: '홍길순' }));
    expect(final).not.toBeNull(); // maxReads hit → best-effort settle
  });

  it('uses phone digits as identity when there is no email', () => {
    const session = createBusinessCardScanSession();
    const noEmail = read({ email: null });
    expect(session.push(noEmail)).toBeNull();
    expect(session.push(noEmail)).not.toBeNull();
  });

  it('votes fields by majority across reads', () => {
    const session = createBusinessCardScanSession({ minReads: 3 });
    session.push(read({ company: '주식회사 예제기술' }));
    session.push(read({ company: '주식회사 예제가술' })); // misread
    const final = session.push(read({ company: '주식회사 예제기술' }));
    expect(final!.company).toBe('주식회사 예제기술');
  });
});
