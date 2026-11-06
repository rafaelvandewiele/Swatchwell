import {
  analyzeSeasonalProfile,
  type SeasonalProfile,
  type ColorSeason,
  type SeasonalAnalysisResult,
} from "@swatchwell/color-engine";

export const COLOR_PROFILE_STORAGE_KEY =
  "swatchwell-color-profile";

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

export function readColorProfile(): StoredColorProfile | null {
  try {
    const stored = localStorage.getItem(
      COLOR_PROFILE_STORAGE_KEY,
    );

    if (!stored) return null;

    const parsed: unknown = JSON.parse(stored);

    if (
      !parsed ||
      typeof parsed !== "object" ||
      !("profile" in parsed)
    ) {
      return null;
    }

    const profile = (parsed as StoredColorProfile).profile;
    const result = createColorProfile(profile);

    return {
      ...result,
      updatedAt:
        typeof (parsed as StoredColorProfile).updatedAt === "string"
          ? (parsed as StoredColorProfile).updatedAt
          : result.updatedAt,
    };
  } catch {
    return null;
  }
}

export function saveColorProfile(
  profile: SeasonalProfile,
): StoredColorProfile {
  const result = createColorProfile(profile);

  localStorage.setItem(
    COLOR_PROFILE_STORAGE_KEY,
    JSON.stringify(result),
  );

  return result;
}

export function removeColorProfile(): void {
  localStorage.removeItem(COLOR_PROFILE_STORAGE_KEY);
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
