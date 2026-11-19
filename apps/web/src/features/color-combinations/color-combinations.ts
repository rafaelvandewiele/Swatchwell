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
  navy: { name: 'Navy blue', hex: '#263B55' },
  charcoal: { name: 'Dark grey', hex: '#3C4146' },
  slateBlue: { name: 'Slate blue', hex: '#647C91' },
  camel: { name: 'Camel', hex: '#B68B61' },
  olive: { name: 'Olive', hex: '#69745A' },
  forestGreen: { name: 'Dark green', hex: '#365747' },
  darkBrown: { name: 'Brown', hex: '#684B35' },
  burgundy: { name: 'Burgundy', hex: '#713F4B' },
  beige: { name: 'Beige', hex: '#D7C5A8' },
  white: { name: 'White', hex: '#F8F7F2' },
  offWhite: { name: 'Off-white', hex: '#F1EDE3' },
  cream: { name: 'Cream', hex: '#E8DDC8' },
  paleBlue: { name: 'Light blue', hex: '#B8CAD8' },
  lightPink: { name: 'Light pink', hex: '#E8BFC5' },
  dustyRose: { name: 'Dusty rose', hex: '#C58F91' },
  stone: { name: 'Stone', hex: '#C8BDAA' },
  lightGrey: { name: 'Light grey', hex: '#C5C7C5' },
  midGrey: { name: 'Mid grey', hex: '#858783' },
  taupe: { name: 'Taupe', hex: '#93877A' },
  black: { name: 'Black', hex: '#242424' },
  lightBlueJeans: { name: 'Light blue jeans', hex: '#A9C7DF' },
  midBlueJeans: { name: 'Mid-blue jeans', hex: '#52799B' },
  darkBlueJeans: { name: 'Dark blue jeans', hex: '#243F5B' },
} satisfies Record<string, GarmentColour>;

const upperColours = [
  colours.offWhite, colours.black, colours.lightGrey, colours.midGrey,
  colours.white, colours.lightPink, colours.darkBrown, colours.navy,
  colours.charcoal, colours.slateBlue, colours.camel, colours.olive,
  colours.forestGreen, colours.burgundy, colours.beige, colours.cream,
];

const shirtColours = [
  colours.lightPink, colours.lightGrey, colours.midGrey, colours.navy,
  colours.paleBlue, colours.black, colours.darkBrown, colours.offWhite,
  colours.white, colours.cream, colours.dustyRose, colours.slateBlue,
];

const trouserColours = [
  colours.forestGreen, colours.offWhite, colours.lightGrey, colours.midGrey,
  colours.paleBlue, colours.black, colours.darkBrown, colours.beige,
  colours.stone, colours.olive, colours.navy, colours.charcoal,
  colours.lightBlueJeans, colours.midBlueJeans, colours.darkBlueJeans,
];

function toHsl(hex: string): { hue: number; saturation: number; lightness: number } {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16) / 255);
  const [red, green, blue] = channels;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const difference = maximum - minimum;
  let hue = 0;
  if (difference !== 0) {
    if (maximum === red) hue = ((green - blue) / difference) % 6;
    else if (maximum === green) hue = (blue - red) / difference + 2;
    else hue = (red - green) / difference + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  const lightness = (maximum + minimum) / 2;
  const saturation = difference === 0 ? 0 : difference / (1 - Math.abs(2 * lightness - 1));
  return { hue, saturation, lightness };
}

function coloursWorkTogether(first: GarmentColour, second: GarmentColour): boolean {
  const a = toHsl(first.hex);
  const b = toHsl(second.hex);
  // Near-neutral wardrobe staples are reliable bridges between colour families.
  if (a.saturation < 0.16 || b.saturation < 0.16) return true;

  const hueDistance = Math.abs(a.hue - b.hue);
  const shortestDistance = Math.min(hueDistance, 360 - hueDistance);
  const mutedPair = Math.max(a.saturation, b.saturation) < 0.48;
  // Permit analogous, split-complementary and complementary relationships.
  return shortestDistance <= 58 || shortestDistance >= 122 || mutedPair;
}

function isBalancedOutfit(upper: GarmentColour, shirt: GarmentColour, trousers: GarmentColour): boolean {
  return coloursWorkTogether(upper, shirt)
    && coloursWorkTogether(upper, trousers)
    && coloursWorkTogether(shirt, trousers);
}

const combinations: CuratedColourCombination[] = [];
for (const upper of upperColours) {
  for (const shirt of shirtColours) {
    for (const trousers of trouserColours) {
      if (!isBalancedOutfit(upper, shirt, trousers)) continue;
      combinations.push({
        id: [upper, shirt, trousers].map((colour) => colour.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')).join('-'),
        upper,
        shirt,
        trousers,
        note: 'A balanced combination built around wearable colour relationships, neutral anchors and clear contrast.',
      });
    }
  }
}

export const CURATED_COLOUR_COMBINATIONS = combinations;

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
