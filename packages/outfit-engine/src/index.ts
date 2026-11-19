import {
  calculateColorCompatibility,
  deltaE2000,
  hexToRgb,
  normalizeHex,
  rgbToLab,
  type ColorSeason,
} from "@swatchwell/color-engine";

export interface OutfitGarment {
  id: string;
  name: string;
  color: string;
  extraColors?: string[];
}

export type OutfitRating =
  | "excellent"
  | "good"
  | "moderate"
  | "low";

export interface OutfitHarmonyResult {
  score: number;
  rating: OutfitRating;
  garmentCount: number;
  averageColorDifference: number;
  seasonalCompatibility?: number;
  recommendations: string[];
  styleCommentary: string;
  normalizedGarments: OutfitGarment[];
}

function validateGarments(garments: OutfitGarment[]): void {
  if (!Array.isArray(garments) || garments.length < 2) {
    throw new RangeError("An outfit must contain at least two garments.");
  }

  const ids = new Set<string>();

  for (const garment of garments) {
    if (
      !garment ||
      typeof garment.id !== "string" ||
      garment.id.trim().length === 0 ||
      typeof garment.name !== "string" ||
      garment.name.trim().length === 0
    ) {
      throw new TypeError("Every garment needs an ID and a name.");
    }

    if (ids.has(garment.id)) {
      throw new RangeError("Garment IDs must be unique.");
    }

    ids.add(garment.id);
    normalizeHex(garment.color);

    if (garment.extraColors !== undefined) {
      if (!Array.isArray(garment.extraColors)) {
        throw new TypeError("Extra colors must be an array.");
      }

      garment.extraColors.forEach(normalizeHex);
    }
  }
}

function getColors(garment: OutfitGarment): string[] {
  return [
    normalizeHex(garment.color),
    ...(garment.extraColors ?? []).map(normalizeHex),
  ];
}

function getRating(score: number): OutfitRating {
  if (score >= 88) return "excellent";
  if (score >= 75) return "good";
  if (score >= 60) return "moderate";
  return "low";
}

function calculateGarmentPairDifference(
  first: OutfitGarment,
  second: OutfitGarment,
): number {
  const firstColors = getColors(first);
  const secondColors = getColors(second);

  let total = 0;
  let comparisons = 0;

  for (const firstColor of firstColors) {
    const firstLab = rgbToLab(hexToRgb(firstColor));

    for (const secondColor of secondColors) {
      const secondLab = rgbToLab(hexToRgb(secondColor));

      total += deltaE2000(firstLab, secondLab);
      comparisons += 1;
    }
  }

  return comparisons === 0 ? 0 : total / comparisons;
}

function calculatePairwiseHarmony(
  garments: OutfitGarment[],
): { score: number; averageDifference: number } {
  const pairDifferences: number[] = [];

  for (let i = 0; i < garments.length; i += 1) {
    for (let j = i + 1; j < garments.length; j += 1) {
      pairDifferences.push(
        calculateGarmentPairDifference(garments[i], garments[j]),
      );
    }
  }

  const averageDifference =
    pairDifferences.reduce((sum, value) => sum + value, 0) /
    pairDifferences.length;

  /*
   * A useful outfit can be either tonal or contrasting.
   * Very small differences may look monotonous, while very large
   * differences can become visually disconnected.
   *
   * This heuristic favours a moderate amount of colour variation.
   * It is deliberately not presented as a scientific style score.
   */
  const targetDifference = 26;
  const distanceFromTarget = Math.abs(
    averageDifference - targetDifference,
  );

  const score = Math.round(
    Math.max(35, Math.min(96, 96 - distanceFromTarget * 1.25)),
  );

  return { score, averageDifference };
}

function buildRecommendations(
  averageDifference: number,
): string[] {
  if (averageDifference < 9) {
    return [
      "This combination uses very similar colours. A subtle accent could add more visual depth.",
    ];
  }

  if (averageDifference < 17) {
    return [
      "A restrained tonal combination with a cohesive colour palette.",
    ];
  }

  if (averageDifference <= 34) {
    return [
      "A balanced mix of colour variation and visual cohesion.",
    ];
  }

  if (averageDifference <= 45) {
    return [
      "This combination uses noticeable colour contrast. Keep the remaining pieces relatively simple.",
    ];
  }

  return [
    "The colours have strong contrast. Consider replacing one piece with a more neutral colour to create greater cohesion.",
  ];
}


function getStyleCommentary(garments: OutfitGarment[]): string {
  const colours = garments.flatMap(getColors).map((hex) => {
    const red = parseInt(hex.slice(1, 3), 16) / 255;
    const green = parseInt(hex.slice(3, 5), 16) / 255;
    const blue = parseInt(hex.slice(5, 7), 16) / 255;
    const maximum = Math.max(red, green, blue);
    const minimum = Math.min(red, green, blue);
    const difference = maximum - minimum;
    let hue = 0;
    if (difference > 0) {
      if (maximum === red) hue = ((green - blue) / difference) % 6;
      else if (maximum === green) hue = (blue - red) / difference + 2;
      else hue = (red - green) / difference + 4;
      hue = (hue * 60 + 360) % 360;
    }
    const lightness = (maximum + minimum) / 2;
    const saturation = difference === 0 ? 0 : difference / (1 - Math.abs(2 * lightness - 1));
    return { hue, saturation, lightness };
  });
  const isNeutral = (colour: { saturation: number; lightness: number }) =>
    colour.saturation < 0.12 || colour.lightness < 0.12 || colour.lightness > 0.90;
  const chromatic = colours.filter((colour) => !isNeutral(colour));
  const neutrals = colours.filter(isNeutral);
  const hues = chromatic.map((colour) => colour.hue);
  const distance = (a: number, b: number) => {
    const difference = Math.abs(a - b);
    return Math.min(difference, 360 - difference);
  };
  const maxDistance = hues.length > 1 ? Math.max(...hues.flatMap((hue) => hues.map((other) => distance(hue, other)))) : 0;
  const hasWarm = chromatic.some(({ hue }) => hue < 70 || hue >= 340);
  const hasCool = chromatic.some(({ hue }) => hue >= 165 && hue < 290);
  const hasGreen = chromatic.some(({ hue }) => hue >= 75 && hue <= 165);
  const hasBlue = chromatic.some(({ hue }) => hue >= 190 && hue <= 255);
  const hasBurgundy = chromatic.some(({ hue }) => hue >= 330 || hue <= 12);
  const hasEarthNeutral = colours.some(({ hue, saturation, lightness }) =>
    saturation >= 0.12 && saturation < 0.58 && hue >= 15 && hue <= 55 && lightness >= 0.16 && lightness <= 0.78);
  const averageSaturation = chromatic.length ? chromatic.reduce((sum, colour) => sum + colour.saturation, 0) / chromatic.length : 0;
  const lightnessRange = Math.max(...colours.map((colour) => colour.lightness)) - Math.min(...colours.map((colour) => colour.lightness));
  const tonal = chromatic.length >= 2 && maxDistance <= 34;
  const analogous = chromatic.length >= 2 && maxDistance > 34 && maxDistance <= 78;
  const complementary = hues.some((hue, index) => hues.slice(index + 1).some((other) => distance(hue, other) >= 145 && distance(hue, other) <= 180));
  const triadic = hues.length >= 3 && hues.some((hue) =>
    hues.some((other) => distance(hue, other) >= 95 && distance(hue, other) <= 145));

  if (chromatic.length === 0) return "A neutral palette of black, white, grey or beige keeps the outfit understated; differences in lightness add definition.";
  if (hasGreen && hasEarthNeutral) return "Olive and earthy tones sit naturally together. The warm brown-beige notes soften the green and give the outfit a relaxed feel.";
  if (hasBlue && hasEarthNeutral && neutrals.length > 0) return "Blue and warm brown or beige create a timeless classic contrast: cool and crisp against warm and grounded.";
  if (tonal) return "The shades stay within one colour family. Mixing lighter and darker tones gives the outfit depth without introducing a competing colour.";
  if (triadic) return "Three distinct colour families give the outfit energy. Let the strongest shade lead and keep the other colours quieter.";
  if (complementary && averageSaturation < 0.62) return "The muted opposing colours create clear contrast without looking overly bright. The neutral pieces help the palette feel grounded.";
  if (complementary) return "Opposing colour families make this a high-contrast outfit. Keep one shade dominant and use the other as a smaller accent.";
  if (analogous) return "Neighbouring colour families blend naturally. The subtle shift between the shades adds interest while keeping the outfit cohesive.";
  if (hasBurgundy && neutrals.length > 0) return "Burgundy provides a rich focal point, while the neutral and earthy shades keep the outfit balanced.";
  if (neutrals.length > 0 && chromatic.length === 1) return "A single colour accent stands out against the neutral base. This keeps the outfit easy to combine without making it look plain.";
  if (hasWarm && !hasCool) return "The warm palette brings together reds, oranges or yellows. Differences in depth keep the result from feeling too uniform.";
  if (hasCool && !hasWarm) return "The cool palette brings together blues, greens or purples. A mix of light and dark shades gives it a clear structure.";
  if (lightnessRange < 0.18) return "The colours have a similar depth, creating a soft, low-contrast result. A lighter or darker piece would make the outfit more defined.";
  return "The palette mixes different colour families and levels of contrast. Repeating one shade or adding a neutral bridge would make the pieces feel more connected.";
}

export function analyzeOutfitHarmony(
  garments: OutfitGarment[],
  season?: ColorSeason,
): OutfitHarmonyResult {
  validateGarments(garments);

  const normalizedGarments = garments.map((garment) => ({
    ...garment,
    color: normalizeHex(garment.color),
    ...(garment.extraColors
      ? { extraColors: garment.extraColors.map(normalizeHex) }
      : {}),
  }));

  const harmony = calculatePairwiseHarmony(normalizedGarments);

  let seasonalCompatibility: number | undefined;

  if (season) {
    const scores = normalizedGarments.flatMap((garment) =>
      getColors(garment).map(
        (color) => calculateColorCompatibility(color, season).score,
      ),
    );

    seasonalCompatibility = Math.round(
      scores.reduce((sum, score) => sum + score, 0) / scores.length,
    );
  }

  const score = Math.round(
    seasonalCompatibility === undefined
      ? harmony.score
      : harmony.score * 0.75 + seasonalCompatibility * 0.25,
  );

  return {
    score,
    rating: getRating(score),
    garmentCount: normalizedGarments.length,
    averageColorDifference: Number(harmony.averageDifference.toFixed(2)),
    ...(seasonalCompatibility !== undefined && { seasonalCompatibility }),
    recommendations: buildRecommendations(harmony.averageDifference),
    styleCommentary: getStyleCommentary(normalizedGarments),
    normalizedGarments,
  };
}

export * from "./generator";
