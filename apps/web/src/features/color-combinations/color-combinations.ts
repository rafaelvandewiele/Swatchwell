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
  taupe: { name: 'Taupe', hex: '#93877A' },
  black: { name: 'Black', hex: '#242424' },
  lightBlueJeans: { name: 'Light blue jeans', hex: '#A9C7DF' },
  midBlueJeans: { name: 'Mid-blue jeans', hex: '#52799B' },
  darkBlueJeans: { name: 'Dark blue jeans', hex: '#243F5B' },
} satisfies Record<string, GarmentColour>;

const upperColours = [
  colours.offWhite, colours.black, colours.lightGrey, colours.charcoal,
  colours.white, colours.lightPink, colours.darkBrown, colours.navy,
  colours.slateBlue, colours.camel, colours.olive,
  colours.forestGreen, colours.burgundy, colours.beige, colours.cream,
];

const shirtColours = [
  colours.lightPink, colours.lightGrey, colours.charcoal, colours.navy,
  colours.paleBlue, colours.black, colours.darkBrown, colours.offWhite,
  colours.white, colours.cream, colours.dustyRose, colours.slateBlue,
];

const trouserColours = [
  colours.forestGreen, colours.offWhite, colours.white, colours.lightGrey, colours.charcoal,
  colours.paleBlue, colours.black, colours.darkBrown, colours.beige,
  colours.stone, colours.olive, colours.navy,
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
  const aNeutral = a.saturation < 0.16;
  const bNeutral = b.saturation < 0.16;
  const lightnessContrast = Math.abs(a.lightness - b.lightness);

  // Neutrals are useful anchors, not universal wildcards. Require enough
  // light/dark separation so adjacent garments do not visually disappear.
  if (aNeutral && bNeutral) {
    return lightnessContrast >= 0.08 && lightnessContrast <= 0.68;
  }
  if (aNeutral || bNeutral) {
    return lightnessContrast >= 0.14 && lightnessContrast <= 0.74;
  }

  const hueDistance = Math.abs(a.hue - b.hue);
  const shortestDistance = Math.min(hueDistance, 360 - hueDistance);
  // Keep only close analogous and clear complementary relationships.
  // Muted colours are not automatically compatible simply because they are muted.
  return shortestDistance <= 42 || shortestDistance >= 165;
}

function buildCombinationNote(upper: GarmentColour, shirt: GarmentColour, trousers: GarmentColour): string {
  const garments = [upper, shirt, trousers];
  const profiles = garments.map((colour) => ({ colour, ...toHsl(colour.hex) }));
  const neutral = profiles.filter((item) => item.saturation < 0.16);
  const chromatic = profiles.filter((item) => item.saturation >= 0.16);
  const hueDistance = (a: number, b: number) => {
    const difference = Math.abs(a - b);
    return Math.min(difference, 360 - difference);
  };
  const pairs = profiles.flatMap((item, index) =>
    profiles.slice(index + 1).map((other) => ({
      first: item.colour,
      second: other.colour,
      distance: hueDistance(item.hue, other.hue),
    })),
  );
  const complementaryPair = pairs.find((pair) => pair.distance >= 150);
  const analogousPair = pairs.find((pair) => pair.distance > 8 && pair.distance <= 42);

  if (chromatic.length === 0) {
    return `${upper.name}, ${shirt.name} and ${trousers.name} form a neutral palette. The differences in lightness separate the pieces while keeping the outfit calm and versatile.`;
  }
  if (neutral.length >= 2) {
    const accent = chromatic[0].colour;
    return `${accent.name} is the focal colour, while ${neutral.map((item) => item.colour.name.toLowerCase()).join(" and ")} provide a quiet base. This keeps the accent clear without making the outfit feel busy.`;
  }
  if (complementaryPair) {
    return `${complementaryPair.first.name} and ${complementaryPair.second.name} create the main colour contrast. ${garments.find((item) => item !== complementaryPair.first && item !== complementaryPair.second)!.name} supports that contrast without competing with it.`;
  }
  if (analogousPair) {
    return `${analogousPair.first.name} and ${analogousPair.second.name} sit close on the colour wheel, so they blend naturally. ${garments.find((item) => item !== analogousPair.first && item !== analogousPair.second)!.name} adds separation and keeps the palette defined.`;
  }
  if (chromatic.length === 1) {
    return `${chromatic[0].colour.name} adds colour to a base of ${neutral.map((item) => item.colour.name.toLowerCase()).join(" and ")}. The neutral pieces let the colour stand out while keeping the outfit easy to wear.`;
  }
  return `${upper.name}, ${shirt.name} and ${trousers.name} combine different levels of warmth and colour depth. The strongest shade should remain the accent, with the other pieces providing balance.`;
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
        note: buildCombinationNote(upper, shirt, trousers),
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
