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
  it('documents unique complete outfits with valid hex colours', () => {
    expect(new Set(CURATED_COLOUR_COMBINATIONS.map((item) => item.id)).size).toBe(CURATED_COLOUR_COMBINATIONS.length);
    expect(new Set(CURATED_COLOUR_COMBINATIONS.map((item) => item.note)).size).toBeGreaterThan(5);
    for (const item of CURATED_COLOUR_COMBINATIONS) {
      expect(item.note.length).toBeGreaterThan(10);
      for (const colour of [item.upper, item.shirt, item.trousers]) {
        expect(colour.hex).toMatch(/^#[0-9A-F]{6}$/i);
      }
    }
  });

  it('offers every requested colour in its intended garment category', () => {
    const upper = getFirstColourOptions('upper').map((colour) => colour.name);
    const trousers = getFirstColourOptions('trousers').map((colour) => colour.name);
    const shirts = [...new Set(CURATED_COLOUR_COMBINATIONS.map((item) => item.shirt.name))];

    expect(upper).toEqual(expect.arrayContaining(['Off-white', 'Black', 'Light grey', 'Dark grey', 'White', 'Light pink', 'Brown']));
    expect(trousers).toEqual(expect.arrayContaining(['Dark green', 'Off-white', 'Light grey', 'Dark grey', 'Light blue', 'Black', 'Brown']));
    expect(shirts).toEqual(expect.arrayContaining(['Off-white', 'Light pink', 'Light grey', 'Dark grey', 'Navy blue', 'Light blue', 'Black', 'Brown']));
  });

  it('makes off-white available for all three garments', () => {
    const offWhite = '#F1EDE3';
    expect(getFirstColourOptions('upper').some((colour) => colour.hex === offWhite)).toBe(true);
    expect(getFirstColourOptions('trousers').some((colour) => colour.hex === offWhite)).toBe(true);
    expect(CURATED_COLOUR_COMBINATIONS.some((item) => item.shirt.hex === offWhite)).toBe(true);
  });

  it('offers matching shirts and third garments for every selectable first colour', () => {
    for (const firstGarment of ['upper', 'trousers'] as const) {
      for (const first of getFirstColourOptions(firstGarment)) {
        const shirts = getMatchingShirtColours(firstGarment, first.hex);
        expect(shirts.length).toBeGreaterThan(0);
        for (const shirt of shirts) {
          const third = getMatchingThirdColours(firstGarment, first.hex, shirt.hex);
          expect(third.length).toBeGreaterThan(0);
          expect(getApprovedCombinations(firstGarment, first.hex, shirt.hex).length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('keeps all three denim washes and separates non-denim light blue', () => {
    const names = getFirstColourOptions('trousers').map((colour) => colour.name);
    expect(names).toEqual(expect.arrayContaining(['Light blue', 'Light blue jeans', 'Mid-blue jeans', 'Dark blue jeans']));
  });

  it('filters out colour pairs outside the curated hue relationships', () => {
    const forestGreen = getFirstColourOptions('upper').find((colour) => colour.name === 'Dark green');
    expect(forestGreen).toBeDefined();
    const matchingShirts = getMatchingShirtColours('upper', forestGreen!.hex).map((colour) => colour.name);
    expect(matchingShirts).not.toContain('Light pink');
    expect(matchingShirts).not.toContain('Light blue');
    expect(matchingShirts.length).toBeLessThan(8);

    const lightGreyShirt = matchingShirts.find((name) => name === 'Light grey');
    expect(lightGreyShirt).toBeDefined();
    const shirt = getMatchingShirtColours('upper', forestGreen!.hex).find((colour) => colour.name === lightGreyShirt);
    const remainingTrousers = getMatchingThirdColours('upper', forestGreen!.hex, shirt!.hex);
    expect(remainingTrousers.length).toBeLessThan(getFirstColourOptions('trousers').length);
  });

  it('assigns selected colours to the correct garment previews', () => {
    const upper = { name: 'Navy blue', hex: '#263B55' };
    const shirt = { name: 'White', hex: '#F8F7F2' };
    const trousers = { name: 'Light blue jeans', hex: '#A9C7DF' };
    expect(getCompleteOutfitColours('upper', upper, shirt, trousers)).toEqual({ upper, shirt, trousers });
    expect(getCompleteOutfitColours('trousers', trousers, shirt, upper)).toEqual({ upper, shirt, trousers });
  });
});
