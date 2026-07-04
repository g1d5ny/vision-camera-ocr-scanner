import { describe, it, expect } from '@jest/globals';
import { detectDocument } from '../detectDocument';

// German TD3 passport sample (same as parseMrz tests).
const MRZ_LINES = [
  'P<D<<MUSTERMANN<<ERIKA<<<<<<<<<<<<<<<<<<<<<<',
  'C01X00T478D<<6408125F2702283<<<<<<<<<<<<<<<4',
];

describe('detectDocument', () => {
  it('detects a valid MRZ', () => {
    const result = detectDocument(MRZ_LINES);
    expect(result?.type).toBe('mrz');
    expect(result?.valid).toBe(true);
    if (result?.type === 'mrz') {
      expect(result.data.documentNumber).toBe('C01X00T47');
    }
  });

  it('detects a valid card', () => {
    const result = detectDocument(['4111 1111 1111 1111', 'VALID THRU 08/27']);
    expect(result?.type).toBe('card');
    expect(result?.valid).toBe(true);
    if (result?.type === 'card') {
      expect(result.data.brand).toBe('visa');
    }
  });

  it('prefers MRZ over a Luhn-failing card when both structurally parse', () => {
    // MRZ lines plus a noisy card-ish line; MRZ self-validates so it wins.
    const result = detectDocument([...MRZ_LINES, '4111 1111 1111 1112']);
    expect(result?.type).toBe('mrz');
    expect(result?.valid).toBe(true);
  });

  it('returns a card with valid:false when only a Luhn-failing card is present', () => {
    const result = detectDocument(['4111 1111 1111 1112']);
    expect(result?.type).toBe('card');
    expect(result?.valid).toBe(false);
  });

  it('returns null for noise', () => {
    expect(detectDocument(['hello world', 'nothing here'])).toBeNull();
    expect(detectDocument([])).toBeNull();
  });
});
