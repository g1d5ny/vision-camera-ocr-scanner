import { describe, it, expect } from '@jest/globals';
import { createCardScanSession, createMrzScanSession } from '../scanSession';
import type { CardResult } from '../parseCard';
import type { MrzResult } from '../parseMrz';

function cardRead(overrides: Partial<CardResult> = {}): CardResult {
  return {
    valid: true,
    number: '4111111111111111',
    numberFormatted: '4111 1111 1111 1111',
    brand: 'visa',
    expiryMonth: '08',
    expiryYear: '27',
    holderName: 'HONG GILDONG',
    lines: [],
    ...overrides,
  };
}

function mrzRead(overrides: Partial<MrzResult> = {}): MrzResult {
  return {
    valid: true,
    fieldsValid: true,
    format: 'TD3',
    documentNumber: 'M12345678',
    firstName: 'GILDONG',
    lastName: 'HONG',
    nationality: 'KOR',
    issuingState: 'KOR',
    birthDate: '900101',
    expirationDate: '300101',
    sex: 'male',
    lines: [],
    ...overrides,
  };
}

describe('createCardScanSession', () => {
  it('holds until the same number repeats minReads times', () => {
    const session = createCardScanSession();
    expect(session.push(cardRead())).toBeNull();
    expect(session.push(cardRead())).toBeNull();
    const final = session.push(cardRead());
    expect(final).not.toBeNull();
    expect(final!.number).toBe('4111111111111111');
    expect(final!.holderName).toBe('HONG GILDONG');
  });

  it('ignores invalid and null reads', () => {
    const session = createCardScanSession();
    expect(session.push(null)).toBeNull();
    expect(session.push(cardRead({ valid: false }))).toBeNull();
    session.push(cardRead());
    session.push(cardRead());
    expect(session.push(cardRead())).not.toBeNull();
  });

  it('is not derailed by one-off bogus numbers between good reads', () => {
    const session = createCardScanSession();
    session.push(cardRead());
    session.push(cardRead({ number: '5500005555555559' })); // random Luhn-valid junk
    session.push(cardRead());
    const final = session.push(cardRead());
    expect(final).not.toBeNull();
    expect(final!.number).toBe('4111111111111111');
  });

  it('waits for a repeated name instead of trusting a single read', () => {
    const session = createCardScanSession();
    // Two one-off misreads — 'XQ ZWYV' is meaningless OCR garbage and
    // 'HONO GILDONO' mimics the classic G→O confusion of the real name —
    // followed by the correct name twice.
    session.push(cardRead({ holderName: 'XQ ZWYV' }));
    session.push(cardRead({ holderName: 'HONO GILDONO' }));
    // Identity is stable at 3 reads, but no name has repeated yet.
    expect(session.push(cardRead({ holderName: 'HONG GILDONG' }))).toBeNull();
    const final = session.push(cardRead({ holderName: 'HONG GILDONG' }));
    expect(final).not.toBeNull();
    expect(final!.holderName).toBe('HONG GILDONG');
  });

  it('settles with a null name after maxReads when the name never stabilizes', () => {
    const session = createCardScanSession({ maxReads: 5 });
    session.push(cardRead({ holderName: 'AA AA' }));
    session.push(cardRead({ holderName: 'BB BB' }));
    session.push(cardRead({ holderName: 'CC CC' }));
    expect(session.push(cardRead({ holderName: 'DD DD' }))).toBeNull();
    const final = session.push(cardRead({ holderName: 'EE EE' }));
    expect(final).not.toBeNull();
    expect(final!.holderName).toBeNull();
  });

  it('accepts a card with no printed name once the read budget is spent', () => {
    const session = createCardScanSession({ maxReads: 4 });
    session.push(cardRead({ holderName: null }));
    session.push(cardRead({ holderName: null }));
    const final = session.push(cardRead({ holderName: null }));
    expect(final).not.toBeNull();
    expect(final!.holderName).toBeNull();
  });

  it('resets on demand', () => {
    const session = createCardScanSession();
    session.push(cardRead());
    session.push(cardRead());
    session.reset();
    expect(session.push(cardRead())).toBeNull();
  });
});

describe('createMrzScanSession', () => {
  it('accepts after agreeing checksum-valid reads and votes the name', () => {
    const session = createMrzScanSession();
    session.push(mrzRead({ firstName: 'GILDONO' })); // one-off misread
    session.push(mrzRead());
    expect(session.push(mrzRead())).not.toBeNull();
  });

  it('rejects parses whose field check digits failed', () => {
    const session = createMrzScanSession();
    session.push(mrzRead({ fieldsValid: false }));
    session.push(mrzRead({ fieldsValid: false }));
    expect(session.push(mrzRead({ fieldsValid: false }))).toBeNull();
  });

  it('accepts fieldsValid reads even when the composite digit failed', () => {
    const session = createMrzScanSession();
    session.push(mrzRead({ valid: false }));
    session.push(mrzRead({ valid: false }));
    expect(session.push(mrzRead({ valid: false }))).not.toBeNull();
  });

  it('accepts checksum-failing reads when requireChecksum is false', () => {
    const session = createMrzScanSession({ requireChecksum: false });
    session.push(mrzRead({ valid: false, fieldsValid: false }));
    session.push(mrzRead({ valid: false, fieldsValid: false }));
    const final = session.push(mrzRead({ valid: false, fieldsValid: false }));
    expect(final).not.toBeNull();
    expect(final!.valid).toBe(false);
  });

  it('keeps the name even when it never repeats (MRZ always has one)', () => {
    const session = createMrzScanSession({ maxReads: 3 });
    session.push(mrzRead({ firstName: 'A' }));
    session.push(mrzRead({ firstName: 'B' }));
    const final = session.push(mrzRead({ firstName: 'C' }));
    expect(final).not.toBeNull();
    expect(final!.firstName).not.toBeNull();
  });
});
