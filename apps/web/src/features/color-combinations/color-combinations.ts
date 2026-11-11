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

const colours = {
  navy: { name: 'Navy', hex: '#263B55' },
  charcoal: { name: 'Charcoal', hex: '#3C4146' },
  slateBlue: { name: 'Slate blue', hex: '#647C91' },
  camel: { name: 'Camel', hex: '#B68B61' },
  olive: { name: 'Olive', hex: '#69745A' },
  forestGreen: { name: 'Forest green', hex: '#365747' },
  darkBrown: { name: 'Dark brown', hex: '#514035' },
  burgundy: { name: 'Burgundy', hex: '#713F4B' },
  beige: { name: 'Beige', hex: '#D7C5A8' },
  white: { name: 'White', hex: '#F5F2EA' },
  ivory: { name: 'Ivory', hex: '#EEE7D8' },
  cream: { name: 'Cream', hex: '#E8DDC8' },
  paleBlue: { name: 'Pale blue', hex: '#B8CAD8' },
  dustyRose: { name: 'Dusty rose', hex: '#C58F91' },
  stone: { name: 'Stone', hex: '#C8BDAA' },
  midGrey: { name: 'Mid grey', hex: '#858783' },
  lightGrey: { name: 'Light grey', hex: '#B7B8B3' },
  taupe: { name: 'Taupe', hex: '#93877A' },
  lightBlueJeans: { name: 'Light blue jeans', hex: '#A9C7DF' },
  midBlueJeans: { name: 'Mid-blue jeans', hex: '#52799B' },
  darkBlueJeans: { name: 'Dark blue jeans', hex: '#243F5B' },
} satisfies Record<string, GarmentColour>;

const palettes = [
  {
    id: 'classic',
    note: 'A classic, versatile palette with clean neutrals and balanced blue tones.',
    uppers: [colours.navy, colours.charcoal, colours.slateBlue, colours.camel],
    shirts: [colours.white, colours.paleBlue, colours.cream, colours.dustyRose],
    trousers: [colours.stone, colours.midGrey, colours.beige, colours.lightBlueJeans, colours.midBlueJeans, colours.darkBlueJeans],
  },
  {
    id: 'earth',
    note: 'A natural palette built around earthy greens, warm browns and soft neutrals.',
    uppers: [colours.olive, colours.forestGreen, colours.camel, colours.darkBrown],
    shirts: [colours.ivory, colours.cream, colours.white, colours.paleBlue],
    trousers: [colours.beige, colours.stone, colours.olive, colours.darkBrown, colours.lightBlueJeans, colours.midBlueJeans],
  },
  {
    id: 'refined',
    note: 'A refined mix of understated accent colours, cool neutrals and denim.',
    uppers: [colours.burgundy, colours.charcoal, colours.beige, colours.slateBlue],
    shirts: [colours.white, colours.ivory, colours.paleBlue, colours.dustyRose],
    trousers: [colours.charcoal, colours.navy, colours.taupe, colours.midGrey, colours.midBlueJeans, colours.darkBlueJeans],
  },
] as const;

/**
 * The catalogue expands curated palette families into individual outfit
 * combinations. Every entry remains a complete upper + shirt + trousers set.
 * The three denim washes are explicit trouser colours and can be selected
 * either as the first garment or as the final garment.
 */
function buildCuratedCombinations(): CuratedColourCombination[] {
  const combinations: CuratedColourCombination[] = [];
  const seen = new Set<string>();

  for (const palette of palettes) {
    for (const upper of palette.uppers) {
      for (const shirt of palette.shirts) {
        for (const trousers of palette.trousers) {
          const id = [upper.name, shirt.name, trousers.name]
            .map((name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))
            .join('-');
          if (seen.has(id)) continue;
          seen.add(id);
          combinations.push({ id, upper, shirt, trousers, note: palette.note });
        }
      }
    }
  }

  return combinations;
}

export const CURATED_COLOUR_COMBINATIONS = buildCuratedCombinations();

function uniqueColours(colourList: GarmentColour[]): GarmentColour[] {
  return colourList.filter((colour, index) =>
    colourList.findIndex((candidate) => candidate.hex === colour.hex) === index,
  );
}

export function getFirstColourOptions(firstGarment: FirstGarment): GarmentColour[] {
  return uniqueColours(CURATED_COLOUR_COMBINATIONS.map((combination) =>
    firstGarment === 'upper' ? combination.upper : combination.trousers,
  ));
}

export function getMatchingShirtColours(firstGarment: FirstGarment, firstHex: string): GarmentColour[] {
  return uniqueColours(CURATED_COLOUR_COMBINATIONS
    .filter((combination) =>
      (firstGarment === 'upper' ? combination.upper.hex : combination.trousers.hex) === firstHex,
    )
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

export function getCompleteOutfitColours(
  firstGarment: FirstGarment,
  firstColour: GarmentColour,
  shirtColour: GarmentColour,
  thirdColour: GarmentColour,
) {
  return firstGarment === 'upper'
    ? { upper: firstColour, shirt: shirtColour, trousers: thirdColour }
    : { upper: thirdColour, shirt: shirtColour, trousers: firstColour };
}
