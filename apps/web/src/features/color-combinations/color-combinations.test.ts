import { describe, expect, it } from 'vitest';
import {
  CURATED_COLOUR_COMBINATIONS,
  getFirstColourOptions,
  getMatchingShirtColours,
  getMatchingThirdColours,
  getApprovedCombinations,
  getCompleteOutfitColours,
} from './color-combinations';

describe('curated colour combinations', () => {
  it('documents each complete outfit with a unique id and valid hex colours', () => {
    expect(new Set(CURATED_COLOUR_COMBINATIONS.map((item) => item.id)).size).toBe(CURATED_COLOUR_COMBINATIONS.length);
    for (const item of CURATED_COLOUR_COMBINATIONS) {
      expect(item.note.length).toBeGreaterThan(10);
      for (const colour of [item.upper, item.shirt, item.trousers]) {
        expect(colour.hex).toMatch(/^#[0-9A-F]{6}$/i);
      }
    }
  });

  it('only offers shirt colours that belong to an approved combination', () => {
    for (const first of getFirstColourOptions('upper')) {
      const shirts = getMatchingShirtColours('upper', first.hex);
      expect(shirts.length).toBeGreaterThan(0);
      for (const shirt of shirts) {
        expect(getApprovedCombinations('upper', first.hex, shirt.hex).length).toBeGreaterThan(0);
      }
    }
  });

  it('only offers third colours that match both previous choices', () => {
    for (const firstGarment of ['upper', 'trousers'] as const) {
      for (const first of getFirstColourOptions(firstGarment)) {
        for (const shirt of getMatchingShirtColours(firstGarment, first.hex)) {
          const third = getMatchingThirdColours(firstGarment, first.hex, shirt.hex);
          expect(third.length).toBeGreaterThan(0);
          expect(getApprovedCombinations(firstGarment, first.hex, shirt.hex).length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('returns the opposite garment as the final selection', () => {
    const upperFirst = getMatchingThirdColours('upper', '#263B55', '#F5F2EA');
    const trousersFirst = getMatchingThirdColours('trousers', '#C8BDAA', '#F5F2EA');
    expect(upperFirst.some((colour) => colour.hex === '#C8BDAA')).toBe(true);
    expect(trousersFirst.some((colour) => colour.hex === '#263B55')).toBe(true);
  });
  it('provides a broad catalogue with all three denim washes', () => {
    expect(CURATED_COLOUR_COMBINATIONS.length).toBeGreaterThan(200);
    const trouserColours = getFirstColourOptions('trousers').map((colour) => colour.name);
    expect(trouserColours).toEqual(expect.arrayContaining([
      'Light blue jeans',
      'Mid-blue jeans',
      'Dark blue jeans',
    ]));
  });

  it('assigns the selected colours to the correct final garment vectors', () => {
    const upper = { name: 'Navy', hex: '#263B55' };
    const shirt = { name: 'White', hex: '#F5F2EA' };
    const trousers = { name: 'Light blue jeans', hex: '#A9C7DF' };

    expect(getCompleteOutfitColours('upper', upper, shirt, trousers)).toEqual({
      upper,
      shirt,
      trousers,
    });
    expect(getCompleteOutfitColours('trousers', trousers, shirt, upper)).toEqual({
      upper,
      shirt,
      trousers,
    });
  });

});
