import { describe, it, expect } from '@jest/globals';
import { parseMrz, extractMrzLines } from '../parseMrz';

// Canonical valid TD3 (passport) example — Erika Mustermann (Germany, "D").
const TD3_LINE_1 = 'P<D<<MUSTERMANN<<ERIKA<<<<<<<<<<<<<<<<<<<<<<';
const TD3_LINE_2 = 'C01X00T478D<<6408125F2702283<<<<<<<<<<<<<<<4';

describe('extractMrzLines', () => {
  it('keeps MRZ lines and drops ordinary text', () => {
    expect(
      extractMrzLines(['PASSPORT', 'Some name here', TD3_LINE_1, TD3_LINE_2])
    ).toEqual([TD3_LINE_1, TD3_LINE_2]);
  });

  it('uppercases and strips spaces from OCR noise', () => {
    expect(extractMrzLines([TD3_LINE_1.toLowerCase(), TD3_LINE_2])).toEqual([
      TD3_LINE_1,
      TD3_LINE_2,
    ]);
  });

  it('keeps a data line that has no < fillers (e.g. trailing 0s)', () => {
    // Real-world TD3 line 2 is often entirely alphanumeric, no `<`.
    const dataLine = 'M123A45670KOR8702010F3008150V200000000000000';
    expect(extractMrzLines(['REPUBLIC OF KOREA', dataLine])).toEqual([
      dataLine,
    ]);
  });
});

describe('parseMrz', () => {
  it('parses when OCR truncated the trailing filler run of line 1', () => {
    // ML Kit routinely stops partway through a long `<<<<…` run.
    const truncated = 'P<D<<MUSTERMANN<<ERIKA<<<';
    const result = parseMrz([truncated, TD3_LINE_2]);
    expect(result).not.toBeNull();
    expect(result!.valid).toBe(true);
    expect(result!.lastName).toBe('MUSTERMANN');
    expect(result!.firstName).toBe('ERIKA');
  });

  it('normalizes guillemets that OCR mistakes for << fillers', () => {
    const mangled = 'P<D<<MUSTERMANN<<ERIKA<<<«««';
    const result = parseMrz([mangled, TD3_LINE_2]);
    expect(result).not.toBeNull();
    expect(result!.lastName).toBe('MUSTERMANN');
  });

  it('reports fieldsValid on a fully valid parse', () => {
    const result = parseMrz([TD3_LINE_1, TD3_LINE_2]);
    expect(result!.fieldsValid).toBe(true);
  });

  it('parses a valid TD3 passport MRZ', () => {
    const result = parseMrz([TD3_LINE_1, TD3_LINE_2]);
    expect(result).not.toBeNull();
    expect(result!.valid).toBe(true);
    expect(result!.format).toBe('TD3');
    expect(result!.documentNumber).toBe('C01X00T47');
    expect(result!.lastName).toBe('MUSTERMANN');
    expect(result!.firstName).toBe('ERIKA');
    expect(result!.nationality).toBe('D');
    expect(result!.sex).toBe('female');
  });

  it('finds the MRZ even when surrounded by other OCR text', () => {
    const result = parseMrz([
      'BUNDESREPUBLIK DEUTSCHLAND',
      'REISEPASS',
      TD3_LINE_1,
      TD3_LINE_2,
    ]);
    expect(result).not.toBeNull();
    expect(result!.documentNumber).toBe('C01X00T47');
  });

  it('flags a corrupted MRZ (bad check digit) as invalid', () => {
    const corrupted = TD3_LINE_2.replace('C01X00T478', 'C01X00T479');
    const result = parseMrz([TD3_LINE_1, corrupted]);
    expect(result).not.toBeNull();
    expect(result!.valid).toBe(false);
  });

  it('returns null when there is no MRZ', () => {
    expect(parseMrz(['Hello world', 'just some text'])).toBeNull();
  });

  it('picks the real MRZ pair even with an extra MRZ-width line around it', () => {
    // A 44-char MRZ-charset line that is NOT a valid MRZ (OCR noise).
    const junk = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGH';
    expect(junk.length).toBe(44);

    const before = parseMrz([junk, TD3_LINE_1, TD3_LINE_2]);
    expect(before?.documentNumber).toBe('C01X00T47');
    expect(before?.lastName).toBe('MUSTERMANN'); // name present => correct pair chosen

    const after = parseMrz([TD3_LINE_1, TD3_LINE_2, junk]);
    expect(after?.documentNumber).toBe('C01X00T47');
    expect(after?.lastName).toBe('MUSTERMANN');
  });
});
