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
    normalizedGarments,
  };
}

export * from "./generator";
