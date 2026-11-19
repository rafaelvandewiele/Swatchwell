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

  const neutralCount = colours.filter((colour) =>
    colour.saturation < 0.2 || colour.lightness < 0.12 || colour.lightness > 0.9,
  ).length;
  const hasBlue = colours.some((colour) => colour.hue >= 190 && colour.hue <= 255);
  const hasGreen = colours.some((colour) => colour.hue >= 75 && colour.hue <= 165);
  const hasBurgundy = colours.some((colour) => colour.hue >= 330 || colour.hue <= 12);
  const hasWarmNeutral = colours.some((colour) =>
    (colour.hue >= 15 && colour.hue <= 48) && colour.saturation < 0.65,
  );
  const chromaticHues = colours
    .filter((colour) => colour.saturation >= 0.2)
    .map((colour) => colour.hue);
  const tonal = chromaticHues.length > 1 && chromaticHues.every((hue) =>
    chromaticHues.every((other) => {
      const difference = Math.abs(hue - other);
      return Math.min(difference, 360 - difference) <= 28;
    }),
  );

  if (tonal) {
    return "A considered tonal look: understated, cohesive and quietly refined.";
  }
  if (hasBurgundy && neutralCount > 0) {
    return "Deep accent tones and calm neutrals give this outfit a polished, rich-looking finish.";
  }
  if (hasGreen && hasWarmNeutral) {
    return "Earthy greens and warm neutrals create a relaxed, natural and effortlessly put-together look.";
  }
  if (hasBlue && hasWarmNeutral) {
    return "The mix of blue and warm neutrals gives this outfit a timeless, smart-casual character.";
  }
  if (neutralCount >= Math.max(2, colours.length - 1)) {
    return "A clean, minimal palette gives this outfit a timeless and quietly elegant character.";
  }
  return "The colours create a balanced, contemporary look with enough contrast to feel intentional.";
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
