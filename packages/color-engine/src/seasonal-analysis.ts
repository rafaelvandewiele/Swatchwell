export type Undertone = "warm" | "cool" | "neutral" | "uncertain";
export type ColorValue = "light" | "deep" | "balanced" | "uncertain";
export type Chroma = "soft" | "clear" | "balanced" | "uncertain";
export type Contrast = "low" | "medium" | "high" | "uncertain";

export type ColorSeason = "spring" | "summer" | "autumn" | "winter";

export type SubSeason =
  | "light-spring"
  | "true-spring"
  | "bright-spring"
  | "light-summer"
  | "true-summer"
  | "soft-summer"
  | "soft-autumn"
  | "true-autumn"
  | "deep-autumn"
  | "deep-winter"
  | "true-winter"
  | "bright-winter";

export type AnalysisConfidence = "low" | "medium" | "high";

export interface SeasonalProfile {
  undertone: Undertone;
  value: ColorValue;
  chroma: Chroma;
  contrast: Contrast;
}

export interface SeasonalAnalysisResult {
  season: ColorSeason;
  subSeason: SubSeason;
  status: "classified" | "needs_review";
  confidence: AnalysisConfidence;
  profile: SeasonalProfile;
  reasons: string[];
}

interface ProfileDefinition {
  id: SubSeason;
  season: ColorSeason;
  label: string;
  undertone: number;
  value: number;
  chroma: number;
  contrast: number;
}

const DEFINITIONS: ProfileDefinition[] = [
  { id: "light-spring", season: "spring", label: "Light Spring", undertone: 1, value: -1, chroma: 1, contrast: -1 },
  { id: "true-spring", season: "spring", label: "True Spring", undertone: 1, value: 0, chroma: 1, contrast: 0 },
  { id: "bright-spring", season: "spring", label: "Bright Spring", undertone: 0.5, value: -1, chroma: 1, contrast: 1 },

  { id: "light-summer", season: "summer", label: "Light Summer", undertone: -1, value: -1, chroma: -1, contrast: -1 },
  { id: "true-summer", season: "summer", label: "True Summer", undertone: -1, value: 0, chroma: -1, contrast: 0 },
  { id: "soft-summer", season: "summer", label: "Soft Summer", undertone: -0.5, value: 0, chroma: -1, contrast: -1 },

  { id: "soft-autumn", season: "autumn", label: "Soft Autumn", undertone: 1, value: 0, chroma: -1, contrast: -1 },
  { id: "true-autumn", season: "autumn", label: "True Autumn", undertone: 1, value: 0, chroma: -1, contrast: 0 },
  { id: "deep-autumn", season: "autumn", label: "Deep Autumn", undertone: 1, value: 1, chroma: -1, contrast: 1 },

  { id: "deep-winter", season: "winter", label: "Deep Winter", undertone: -1, value: 1, chroma: 1, contrast: 1 },
  { id: "true-winter", season: "winter", label: "True Winter", undertone: -1, value: 0, chroma: 1, contrast: 0 },
  { id: "bright-winter", season: "winter", label: "Bright Winter", undertone: -0.5, value: -1, chroma: 1, contrast: 1 },
];

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

function getNumericAnswers(profile: SeasonalProfile) {
  return {
    undertone:
      profile.undertone === "warm" ? 1 :
      profile.undertone === "cool" ? -1 :
      profile.undertone === "neutral" ? 0 : null,

    value:
      profile.value === "light" ? -1 :
      profile.value === "deep" ? 1 :
      profile.value === "balanced" ? 0 : null,

    chroma:
      profile.chroma === "clear" ? 1 :
      profile.chroma === "soft" ? -1 :
      profile.chroma === "balanced" ? 0 : null,

    contrast:
      profile.contrast === "high" ? 1 :
      profile.contrast === "low" ? -1 :
      profile.contrast === "medium" ? 0 : null,
  };
}

export function getSubSeasonLabel(subSeason: SubSeason): string {
  const definition = DEFINITIONS.find((item) => item.id === subSeason);
  return definition?.label ?? "Soft Summer";
}

export function analyzeSeasonalProfile(
  profile: SeasonalProfile,
): SeasonalAnalysisResult {
  validateProfile(profile);

  const answers = getNumericAnswers(profile);
  const weights = {
    undertone: 2,
    value: 1.5,
    chroma: 1.5,
    contrast: 0.75,
  };

  const answeredCount = Object.values(answers).filter(
    (value) => value !== null,
  ).length;

  // With no usable answers, use a deterministic neutral fallback.
  if (answeredCount === 0) {
    return {
      season: "summer",
      subSeason: "soft-summer",
      status: "needs_review",
      confidence: "low",
      profile,
      reasons: [
        "There was not enough information to distinguish between the twelve profiles.",
        "Soft Summer is shown as a starting point. You can update your answers at any time.",
      ],
    };
  }

  const ranked = DEFINITIONS.map((definition) => {
    let totalDistance = 0;
    let totalWeight = 0;

    for (const key of Object.keys(answers) as (keyof typeof answers)[]) {
      const answer = answers[key];
      if (answer === null) continue;

      const weight = weights[key];
      const target = definition[key];

      totalDistance += Math.abs(answer - target) * weight;
      totalWeight += weight;
    }

    return {
      definition,
      score: totalWeight === 0 ? 0 : totalDistance / totalWeight,
    };
  }).sort((a, b) => a.score - b.score);

  const best = ranked[0];
  const second = ranked[1];
  const difference = second.score - best.score;

  const confidence: AnalysisConfidence =
    answeredCount >= 3 && difference >= 0.3
      ? "high"
      : answeredCount >= 2 && difference >= 0.15
        ? "medium"
        : "low";

  return {
    season: best.definition.season,
    subSeason: best.definition.id,
    status: confidence === "low" ? "needs_review" : "classified",
    confidence,
    profile,
    reasons: [
      `Your answers currently fit the ${best.definition.label} profile best.`,
      confidence === "low"
        ? "This is a tentative result because some characteristics are uncertain or overlap with other profiles."
        : "The result is based on the characteristics selected in your questionnaire.",
    ],
  };
}
