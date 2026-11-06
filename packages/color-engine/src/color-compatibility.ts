import {
  deltaE2000,
  hexToRgb,
  normalizeHex,
  rgbToLab,
} from "./index";
import {
  getSeasonalPalette,
  type SeasonalPaletteColor,
} from "./seasonal-palettes";
import type { ColorSeason } from "./seasonal-analysis";

export type CompatibilityRating =
  | "excellent"
  | "good"
  | "moderate"
  | "low";

export interface ColorCompatibilityResult {
  garmentColor: string;
  season: ColorSeason;
  score: number;
  rating: CompatibilityRating;
  closestMatch: SeasonalPaletteColor;
  deltaE: number;
  explanation: string;
}

/**
 * Converts perceptual color difference into a heuristic
 * compatibility score. This is palette similarity, not
 * a scientifically validated personal suitability score.
 */
function calculateScore(deltaE: number): number {
  return Math.round(Math.max(0, Math.min(100, 100 - deltaE * 1.5)));
}

function getRating(score: number): CompatibilityRating {
  if (score >= 85) return "excellent";
  if (score >= 70) return "good";
  if (score >= 50) return "moderate";
  return "low";
}

function getExplanation(
  rating: CompatibilityRating,
  closestMatch: SeasonalPaletteColor,
): string {
  switch (rating) {
    case "excellent":
      return `Very close to ${closestMatch.name} in this seasonal palette.`;
    case "good":
      return `A good color match, with similarities to ${closestMatch.name}.`;
    case "moderate":
      return `Some similarity to ${closestMatch.name}, but the colors differ noticeably.`;
    case "low":
      return `This color differs considerably from the closest palette color, ${closestMatch.name}.`;
  }
}

export function calculateColorCompatibility(
  garmentHex: string,
  season: ColorSeason,
): ColorCompatibilityResult {
  const garmentColor = normalizeHex(garmentHex);
  const garmentLab = rgbToLab(hexToRgb(garmentColor));
  const palette = getSeasonalPalette(season);

  let closestMatch = palette.colors[0];
  let smallestDeltaE = Number.POSITIVE_INFINITY;

  for (const color of palette.colors) {
    const paletteLab = rgbToLab(hexToRgb(color.hex));
    const difference = deltaE2000(garmentLab, paletteLab);

    if (difference < smallestDeltaE) {
      smallestDeltaE = difference;
      closestMatch = color;
    }
  }

  const score = calculateScore(smallestDeltaE);
  const rating = getRating(score);

  return {
    garmentColor,
    season,
    score,
    rating,
    closestMatch: { ...closestMatch },
    deltaE: smallestDeltaE,
    explanation: getExplanation(rating, closestMatch),
  };
}
