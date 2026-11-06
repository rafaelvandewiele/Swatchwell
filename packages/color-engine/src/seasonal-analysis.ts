export type Undertone = "warm" | "cool" | "neutral" | "uncertain";

export type ColorValue =
  | "light"
  | "deep"
  | "balanced"
  | "uncertain";

export type Chroma =
  | "soft"
  | "clear"
  | "balanced"
  | "uncertain";

export type Contrast =
  | "low"
  | "medium"
  | "high"
  | "uncertain";

export type ColorSeason =
  | "spring"
  | "summer"
  | "autumn"
  | "winter";

export interface SeasonalProfile {
  undertone: Undertone;
  value: ColorValue;
  chroma: Chroma;
  contrast: Contrast;
}

export interface SeasonalAnalysisResult {
  season: ColorSeason | null;
  status: "classified" | "needs_review";
  profile: SeasonalProfile;
  reasons: string[];
}

const VALID_VALUES = {
  undertone: ["warm", "cool", "neutral", "uncertain"],
  value: ["light", "deep", "balanced", "uncertain"],
  chroma: ["soft", "clear", "balanced", "uncertain"],
  contrast: ["low", "medium", "high", "uncertain"],
} as const;

function validateProfile(profile: SeasonalProfile): void {
  if (!profile || typeof profile !== "object") {
    throw new TypeError("A valid seasonal profile is required.");
  }

  for (const key of Object.keys(VALID_VALUES) as (keyof SeasonalProfile)[]) {
    if (!VALID_VALUES[key].includes(profile[key] as never)) {
      throw new RangeError(`Invalid seasonal profile value: ${key}`);
    }
  }
}

export function analyzeSeasonalProfile(
  profile: SeasonalProfile,
): SeasonalAnalysisResult {
  validateProfile(profile);

  const needsReview =
    profile.undertone === "neutral" ||
    profile.undertone === "uncertain" ||
    profile.value === "balanced" ||
    profile.value === "uncertain" ||
    profile.chroma === "balanced" ||
    profile.chroma === "uncertain";

  if (needsReview) {
    return {
      season: null,
      status: "needs_review",
      profile,
      reasons: [
        "The available characteristics do not support a reliable four-season classification.",
      ],
    };
  }

  let season: ColorSeason | null = null;

  if (profile.undertone === "warm") {
    if (profile.value === "light" && profile.chroma === "clear") {
      season = "spring";
    }

    if (profile.value === "deep" && profile.chroma === "soft") {
      season = "autumn";
    }
  }

  if (profile.undertone === "cool") {
    if (profile.value === "light" && profile.chroma === "soft") {
      season = "summer";
    }

    if (profile.value === "deep" && profile.chroma === "clear") {
      season = "winter";
    }
  }

  if (!season) {
    return {
      season: null,
      status: "needs_review",
      profile,
      reasons: [
        "The characteristics do not match one of the four simplified seasonal profiles.",
      ],
    };
  }

  return {
    season,
    status: "classified",
    profile,
    reasons: [
      `The characteristics match the simplified ${season} profile.`,
    ],
  };
}
