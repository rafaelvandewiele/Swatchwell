export type FirstGarment = 'upper' | 'trousers';

export interface GarmentColour {
  name: string;
  hex: string;
}

export interface CuratedColourCombination {
  id: string;
  upper: GarmentColour;
  shirt: GarmentColour;
  trousers: GarmentColour;
  note: string;
}

/**
 * Curated outfit combinations.
 *
 * Each record is an approved three-colour outfit: upper layer + shirt + trousers.
 * Add or edit a record here to change the combinations offered by the flow.
 * The UI only exposes colours that occur in a complete approved record, so a
 * third colour can never be selected unless it works with both earlier choices.
 */
export const CURATED_COLOUR_COMBINATIONS: CuratedColourCombination[] = [
  { id: 'navy-white-stone', upper: { name: 'Navy', hex: '#263B55' }, shirt: { name: 'White', hex: '#F5F2EA' }, trousers: { name: 'Stone', hex: '#C8BDAA' }, note: 'A timeless navy-and-white foundation softened by warm stone.' },
  { id: 'navy-blue-grey', upper: { name: 'Navy', hex: '#263B55' }, shirt: { name: 'Pale blue', hex: '#B8CAD8' }, trousers: { name: 'Mid grey', hex: '#858783' }, note: 'Cool, restrained tones with a clear light-to-dark balance.' },
  { id: 'navy-rose-beige', upper: { name: 'Navy', hex: '#263B55' }, shirt: { name: 'Dusty rose', hex: '#C58F91' }, trousers: { name: 'Beige', hex: '#D7C5A8' }, note: 'A muted rose accent balanced by navy and soft beige.' },
  { id: 'charcoal-white-grey', upper: { name: 'Charcoal', hex: '#3C4146' }, shirt: { name: 'White', hex: '#F5F2EA' }, trousers: { name: 'Light grey', hex: '#B7B8B3' }, note: 'A monochromatic combination with subtle tonal separation.' },
  { id: 'charcoal-blue-stone', upper: { name: 'Charcoal', hex: '#3C4146' }, shirt: { name: 'Pale blue', hex: '#B8CAD8' }, trousers: { name: 'Stone', hex: '#C8BDAA' }, note: 'Soft blue lightens the charcoal while stone keeps the outfit balanced.' },
  { id: 'olive-ivory-beige', upper: { name: 'Olive', hex: '#69745A' }, shirt: { name: 'Ivory', hex: '#EEE7D8' }, trousers: { name: 'Beige', hex: '#D7C5A8' }, note: 'A natural, warm combination built around earthy neutrals.' },
  { id: 'olive-white-navy', upper: { name: 'Olive', hex: '#69745A' }, shirt: { name: 'White', hex: '#F5F2EA' }, trousers: { name: 'Navy', hex: '#263B55' }, note: 'A crisp white shirt connects muted olive with deep navy.' },
  { id: 'camel-white-navy', upper: { name: 'Camel', hex: '#B68B61' }, shirt: { name: 'White', hex: '#F5F2EA' }, trousers: { name: 'Navy', hex: '#263B55' }, note: 'A classic warm-and-cool pairing with a clean white centre.' },
  { id: 'camel-blue-brown', upper: { name: 'Camel', hex: '#B68B61' }, shirt: { name: 'Pale blue', hex: '#B8CAD8' }, trousers: { name: 'Dark brown', hex: '#514035' }, note: 'Pale blue offsets the warmth of camel and dark brown.' },
  { id: 'beige-white-olive', upper: { name: 'Beige', hex: '#D7C5A8' }, shirt: { name: 'White', hex: '#F5F2EA' }, trousers: { name: 'Olive', hex: '#69745A' }, note: 'Quiet natural colours with enough contrast to define each piece.' },
  { id: 'beige-blue-navy', upper: { name: 'Beige', hex: '#D7C5A8' }, shirt: { name: 'Pale blue', hex: '#B8CAD8' }, trousers: { name: 'Navy', hex: '#263B55' }, note: 'A light upper half balanced by a grounded navy base.' },
  { id: 'brown-cream-stone', upper: { name: 'Dark brown', hex: '#514035' }, shirt: { name: 'Cream', hex: '#E8DDC8' }, trousers: { name: 'Stone', hex: '#C8BDAA' }, note: 'A tonal earth palette with gentle contrast.' },
  { id: 'burgundy-white-charcoal', upper: { name: 'Burgundy', hex: '#713F4B' }, shirt: { name: 'White', hex: '#F5F2EA' }, trousers: { name: 'Charcoal', hex: '#3C4146' }, note: 'A restrained accent colour framed by two dependable neutrals.' },
  { id: 'forest-cream-beige', upper: { name: 'Forest green', hex: '#365747' }, shirt: { name: 'Cream', hex: '#E8DDC8' }, trousers: { name: 'Beige', hex: '#D7C5A8' }, note: 'Deep green and warm cream create a composed, natural palette.' },
  { id: 'slate-white-taupe', upper: { name: 'Slate blue', hex: '#647C91' }, shirt: { name: 'White', hex: '#F5F2EA' }, trousers: { name: 'Taupe', hex: '#93877A' }, note: 'A cool blue layer grounded by a soft, warm neutral.' }, shirt: { name: 'White', hex: '#F5F2EA' }, trousers: { name: 'Stone', hex: '#C8BDAA' }, note: 'The same balanced classic, starting from the trouser colour.' },
  { id: 'grey-blue-olive', upper: { name: 'Olive', hex: '#69745A' }, shirt: { name: 'Pale blue', hex: '#B8CAD8' }, trousers: { name: 'Mid grey', hex: '#858783' }, note: 'Muted blue and olive sit comfortably against mid grey.' }, shirt: { name: 'White', hex: '#F5F2EA' }, trousers: { name: 'Navy', hex: '#263B55' }, note: 'Camel and navy provide a classic contrast around a white shirt.' },
  { id: 'charcoal-white-olive', upper: { name: 'Olive', hex: '#69745A' }, shirt: { name: 'White', hex: '#F5F2EA' }, trousers: { name: 'Charcoal', hex: '#3C4146' }, note: 'Olive and charcoal are connected by a clean neutral shirt.' },
  { id: 'beige-cream-navy', upper: { name: 'Navy', hex: '#263B55' }, shirt: { name: 'Cream', hex: '#E8DDC8' }, trousers: { name: 'Beige', hex: '#D7C5A8' }, note: 'A softer alternative to bright white with a warm beige base.' },
  { id: 'brown-white-olive', upper: { name: 'Dark brown', hex: '#514035' }, shirt: { name: 'White', hex: '#F5F2EA' }, trousers: { name: 'Olive', hex: '#69745A' }, note: 'A grounded earth combination with a bright neutral shirt.' }, shirt: { name: 'Pale blue', hex: '#B8CAD8' }, trousers: { name: 'Mid grey', hex: '#858783' }, note: 'A dependable blue-and-grey combination with balanced contrast.' },
];

function uniqueColours(colours: GarmentColour[]): GarmentColour[] {
  return colours.filter((colour, index) => colours.findIndex((candidate) => candidate.hex === colour.hex) === index);
}

export function getFirstColourOptions(firstGarment: FirstGarment): GarmentColour[] {
  return uniqueColours(CURATED_COLOUR_COMBINATIONS.map((combination) =>
    firstGarment === 'upper' ? combination.upper : combination.trousers,
  ));
}

export function getMatchingShirtColours(firstGarment: FirstGarment, firstHex: string): GarmentColour[] {
  return uniqueColours(CURATED_COLOUR_COMBINATIONS
    .filter((combination) => (firstGarment === 'upper' ? combination.upper.hex : combination.trousers.hex) === firstHex)
    .map((combination) => combination.shirt));
}

export function getMatchingThirdColours(firstGarment: FirstGarment, firstHex: string, shirtHex: string): GarmentColour[] {
  return uniqueColours(CURATED_COLOUR_COMBINATIONS
    .filter((combination) =>
      (firstGarment === 'upper' ? combination.upper.hex : combination.trousers.hex) === firstHex &&
      combination.shirt.hex === shirtHex,
    )
    .map((combination) => firstGarment === 'upper' ? combination.trousers : combination.upper));
}

export function getApprovedCombinations(firstGarment: FirstGarment, firstHex: string, shirtHex: string) {
  return CURATED_COLOUR_COMBINATIONS.filter((combination) =>
    (firstGarment === 'upper' ? combination.upper.hex : combination.trousers.hex) === firstHex &&
    combination.shirt.hex === shirtHex,
  );
}
