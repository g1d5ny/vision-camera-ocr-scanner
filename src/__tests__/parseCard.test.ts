import { describe, it, expect } from '@jest/globals';
import { parseCard, detectBrand } from '../parseCard';

describe('detectBrand', () => {
  it('identifies major brands', () => {
    expect(detectBrand('4111111111111111')).toBe('visa');
    expect(detectBrand('4242424242424242')).toBe('visa');
    expect(detectBrand('5555555555554444')).toBe('mastercard');
    expect(detectBrand('2223003122003222')).toBe('mastercard'); // 2-series
    expect(detectBrand('378282246310005')).toBe('amex');
    expect(detectBrand('6011111111111117')).toBe('discover');
    expect(detectBrand('3530111333300000')).toBe('jcb');
    expect(detectBrand('0000000000000000')).toBe('unknown');
  });

  it('respects JCB and Discover BIN range boundaries', () => {
    // JCB is 3528–3589, not all of 35xx.
    expect(detectBrand('3528000000000007')).toBe('jcb');
    expect(detectBrand('3589000000000004')).toBe('jcb');
    expect(detectBrand('3500000000000006')).toBe('unknown'); // below 3528
    // Discover UnionPay-overlap range 622126–622925.
    expect(detectBrand('6221260000000000')).toBe('discover');
    expect(detectBrand('6229250000000000')).toBe('discover');
    expect(detectBrand('6221250000000000')).toBe('unknown'); // just below range
  });
});

describe('parseCard', () => {
  it('parses a Visa card from OCR lines', () => {
    const result = parseCard([
      '4111 1111 1111 1111',
      'VALID THRU 08/27',
      'JOHN Q PUBLIC',
    ]);
    expect(result).not.toBeNull();
    expect(result!.valid).toBe(true);
    expect(result!.number).toBe('4111111111111111');
    expect(result!.numberFormatted).toBe('4111 1111 1111 1111');
    expect(result!.brand).toBe('visa');
    expect(result!.expiryMonth).toBe('08');
    expect(result!.expiryYear).toBe('27');
    expect(result!.holderName).toBe('JOHN Q PUBLIC');
  });

  it('formats Amex as 4-6-5 and reads the 15-digit number', () => {
    const result = parseCard(['3782 822463 10005', '05/29']);
    expect(result!.brand).toBe('amex');
    expect(result!.number).toBe('378282246310005');
    expect(result!.numberFormatted).toBe('3782 822463 10005');
    expect(result!.valid).toBe(true);
    expect(result!.expiryMonth).toBe('05');
    expect(result!.expiryYear).toBe('29');
  });

  it('picks the latest expiry when several appear (member since / valid thru)', () => {
    const result = parseCard([
      '3782 822463 10005',
      'MEMBER SINCE 01/09',
      'VALID THRU 04/28',
    ]);
    expect(result!.expiryMonth).toBe('04');
    expect(result!.expiryYear).toBe('28');
  });

  it('joins a number split across lines', () => {
    const result = parseCard(['4242', '4242', '4242', '4242']);
    expect(result!.number).toBe('4242424242424242');
    expect(result!.valid).toBe(true);
    expect(result!.brand).toBe('visa');
  });

  it('ignores unrelated noise lines', () => {
    const result = parseCard([
      'WORLDELITE',
      'DEBIT',
      '5555 5555 5555 4444',
      '12/26',
    ]);
    expect(result!.number).toBe('5555555555554444');
    expect(result!.brand).toBe('mastercard');
    expect(result!.holderName).toBeNull(); // single-word / label lines aren't names
  });

  it('joins a name split into one line per word', () => {
    const result = parseCard([
      '4111 1111 1111 1111',
      '08/27',
      'HONG',
      'GILDONG',
    ]);
    expect(result!.holderName).toBe('HONG GILDONG');
  });

  it('does not mistake background/editor text for a holder name', () => {
    const result = parseCard([
      '4111 1111 1111 1111',
      'someone, 2 days ago',
      'UTF- LF',
      'Markdown',
      'Ln 9, Col 1 Spaces: 2',
    ]);
    expect(result!.holderName).toBeNull();
  });

  it('accepts names that merely contain a stopword token', () => {
    const result = parseCard(['4111 1111 1111 1111', 'JOHN GOLDBERG']);
    expect(result!.holderName).toBe('JOHN GOLDBERG');
  });

  it('does not join brand words into a name', () => {
    const result = parseCard(['4111 1111 1111 1111', 'VISA', 'PLATINUM']);
    expect(result!.holderName).toBeNull();
  });

  it('returns the number with valid:false on a Luhn-failing read', () => {
    const result = parseCard(['4111 1111 1111 1112']); // last digit off
    expect(result).not.toBeNull();
    expect(result!.number).toBe('4111111111111112');
    expect(result!.valid).toBe(false);
    expect(result!.brand).toBe('visa');
  });

  it('does not fabricate a number from unrelated digit noise', () => {
    // Dates, CVV, and receipt-like numbers must not concatenate into a PAN.
    expect(
      parseCard([
        'MEMBER SINCE 01/09',
        'VALID THRU 04/28',
        'CVV 123',
        'REF 4457 8891',
      ])
    ).toBeNull();
  });

  it('picks the label-adjacent expiry over a later stray date', () => {
    const result = parseCard([
      '4111 1111 1111 1111',
      'ISSUED 08/30', // later date, but not an expiry label
      'VALID THRU 05/27',
    ]);
    expect(result!.expiryMonth).toBe('05');
    expect(result!.expiryYear).toBe('27');
  });

  it('does not read the card number groups as an expiry', () => {
    const result = parseCard(['4111 1111 1111 1111']);
    expect(result!.expiryMonth).toBeNull();
    expect(result!.expiryYear).toBeNull();
  });

  it('returns null when no card number is present', () => {
    expect(parseCard(['hello world', 'no digits here'])).toBeNull();
    expect(parseCard([])).toBeNull();
  });
});
