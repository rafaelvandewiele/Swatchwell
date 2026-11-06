import {
  analyzeSeasonalProfile,
  type SeasonalProfile,
  type ColorSeason,
  type SeasonalAnalysisResult,
} from "@swatchwell/color-engine";

export interface StoredColorProfile {
  profile: SeasonalProfile;
  analysis: SeasonalAnalysisResult;
  updatedAt: string;
}

export function createColorProfile(
  profile: SeasonalProfile,
): StoredColorProfile {
  return {
    profile,
    analysis: analyzeSeasonalProfile(profile),
    updatedAt: new Date().toISOString(),
  };
}

export function getSeasonLabel(
  season: ColorSeason,
): string {
  const labels: Record<ColorSeason, string> = {
    spring: "Spring",
    summer: "Summer",
    autumn: "Autumn",
    winter: "Winter",
  };

  return labels[season];
}
