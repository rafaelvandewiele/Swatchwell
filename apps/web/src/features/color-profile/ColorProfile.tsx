import { useState } from "react";

import type {
  SeasonalProfile,
  ColorSeason,
  PaletteColorCategory,
} from "@swatchwell/color-engine";

import {
  getSeasonalPalette,
} from "@swatchwell/color-engine";

import {
  getSeasonLabel,
  readColorProfile,
  saveColorProfile,
  removeColorProfile,
} from "./color-profile";

import "./ColorProfile.css";

const INITIAL_PROFILE: SeasonalProfile = {
  undertone: "uncertain",
  value: "uncertain",
  chroma: "uncertain",
  contrast: "uncertain",
};

const QUESTIONS = [
  {
    key: "undertone",
    title: "Your undertone",
    description:
      "Which underlying colour temperature seems most suitable?",
    options: [
      { value: "warm", label: "Warm", detail: "Golden, peach or yellow undertones" },
      { value: "cool", label: "Cool", detail: "Pink, red or blue undertones" },
      { value: "neutral", label: "Neutral", detail: "A balance between warm and cool" },
      { value: "uncertain", label: "Not sure", detail: "I cannot confidently determine this" },
    ],
  },
  {
    key: "value",
    title: "Your colour depth",
    description:
      "Which general colour depth best describes your natural colouring?",
    options: [
      { value: "light", label: "Light", detail: "Generally lighter colouring" },
      { value: "deep", label: "Deep", detail: "Generally deeper colouring" },
      { value: "balanced", label: "Balanced", detail: "Neither particularly light nor deep" },
      { value: "uncertain", label: "Not sure", detail: "I cannot confidently determine this" },
    ],
  },
  {
    key: "chroma",
    title: "Your colour clarity",
    description:
      "Which colour quality do you tend to prefer?",
    options: [
      { value: "soft", label: "Soft", detail: "Muted and understated colours" },
      { value: "clear", label: "Clear", detail: "Bright and saturated colours" },
      { value: "balanced", label: "Balanced", detail: "Somewhere between soft and clear" },
      { value: "uncertain", label: "Not sure", detail: "I cannot confidently determine this" },
    ],
  },
  {
    key: "contrast",
    title: "Your contrast",
    description:
      "How much contrast do you generally notice between your natural features?",
    options: [
      { value: "low", label: "Low", detail: "A relatively subtle overall contrast" },
      { value: "medium", label: "Medium", detail: "A moderate level of contrast" },
      { value: "high", label: "High", detail: "A more noticeable overall contrast" },
      { value: "uncertain", label: "Not sure", detail: "I cannot confidently determine this" },
    ],
  },
] as const;

const SEASON_DETAILS: Record<
  ColorSeason,
  { subtitle: string; description: string }
> = {
  spring: {
    subtitle: "Warm · Light · Clear",
    description:
      "Explore warm, lighter and clearer colour combinations.",
  },
  summer: {
    subtitle: "Cool · Light · Soft",
    description:
      "Explore cooler, lighter and more muted colour combinations.",
  },
  autumn: {
    subtitle: "Warm · Deep · Soft",
    description:
      "Explore warm, deeper and more muted colour combinations.",
  },
  winter: {
    subtitle: "Cool · Deep · Clear",
    description:
      "Explore cooler, deeper and clearer colour combinations.",
  },
};

const CATEGORY_DETAILS: {
  key: PaletteColorCategory;
  title: string;
  description: string;
}[] = [
  {
    key: "neutral",
    title: "Neutrals",
    description: "The foundation of your wardrobe.",
  },
  {
    key: "accent",
    title: "Accent colours",
    description: "Colours that add depth and variety.",
  },
  {
    key: "statement",
    title: "Statement colours",
    description: "Distinctive colours for stronger combinations.",
  },
];

function SeasonalPaletteDisplay({ season }: { season: ColorSeason }) {
  const palette = getSeasonalPalette(season);

  return (
    <section className="seasonal-palette">
      <div className="seasonal-palette-heading">
        <div className="eyebrow">YOUR COLOUR SELECTION</div>
        <h3>The {getSeasonLabel(season)} palette</h3>
        <p>
          Twelve curated colours to use as inspiration when
          building your wardrobe.
        </p>
      </div>

      {CATEGORY_DETAILS.map((category) => {
        const colors = palette.colors.filter(
          (color) => color.category === category.key,
        );

        return (
          <div className="palette-category" key={category.key}>
            <div className="palette-category-heading">
              <div>
                <h4>{category.title}</h4>
                <p>{category.description}</p>
              </div>
              <span>{String(colors.length).padStart(2, "0")} COLOURS</span>
            </div>

            <div className="seasonal-color-grid">
              {colors.map((color) => (
                <article className="seasonal-color-card" key={color.hex}>
                  <div
                    className="seasonal-color-swatch"
                    style={{ backgroundColor: color.hex }}
                    aria-label={`${color.name}, ${color.hex}`}
                    title={`${color.name} — ${color.hex}`}
                  />
                  <div className="seasonal-color-details">
                    <strong>{color.name}</strong>
                    <span>{color.hex}</span>
                  </div>
                </article>
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}

export default function ColorProfile() {
  const [profile, setProfile] = useState<SeasonalProfile>(
    () => readColorProfile()?.profile ?? INITIAL_PROFILE,
  );

  const [saved, setSaved] = useState(
    () => readColorProfile() !== null,
  );

  const [step, setStep] = useState(0);
  const [error, setError] = useState("");

  const currentQuestion = QUESTIONS[step];
  const result = saved ? readColorProfile()?.analysis : null;

  function updateAnswer(value: string) {
    setProfile((current) => ({
      ...current,
      [currentQuestion.key]: value,
    }) as SeasonalProfile);

    setError("");
  }

  function saveProfile() {
    try {
      saveColorProfile(profile);
      setSaved(true);
      setError("");
    } catch {
      setError(
        "Your profile could not be saved. Check browser storage.",
      );
    }
  }

  function resetProfile() {
    try {
      removeColorProfile();
      setProfile(INITIAL_PROFILE);
      setSaved(false);
      setStep(0);
      setError("");
    } catch {
      setError("Your profile could not be removed.");
    }
  }

  return (
    <div className="page-content subpage color-profile-page">
      <section className="color-profile-intro">
        <div className="eyebrow">YOUR PERSONAL COLOUR JOURNEY</div>
        <h1>
          Understand your <em>colours.</em>
        </h1>
        <p className="welcome-copy">
          Explore your personal colour characteristics and discover
          a palette to guide your wardrobe.
        </p>
      </section>

      {saved && result ? (
        <>
          <section className="profile-result">
            <div className="eyebrow">YOUR CURRENT PROFILE</div>

            {result.season ? (
              <>
                <h2>{getSeasonLabel(result.season)}</h2>
                <p>{SEASON_DETAILS[result.season].subtitle}</p>
                <p>{SEASON_DETAILS[result.season].description}</p>
              </>
            ) : (
              <>
                <h2>Profile needs review</h2>
                <p>
                  Your selected characteristics do not produce a
                  confident four-season classification. You can
                  update your answers to explore another result.
                </p>
              </>
            )}

            <div className="profile-characteristics">
              <div>
                <span>Undertone</span>
                <strong>{profile.undertone}</strong>
              </div>
              <div>
                <span>Depth</span>
                <strong>{profile.value}</strong>
              </div>
              <div>
                <span>Clarity</span>
                <strong>{profile.chroma}</strong>
              </div>
              <div>
                <span>Contrast</span>
                <strong>{profile.contrast}</strong>
              </div>
            </div>

            <div className="profile-actions">
              <button
                className="primary-button"
                type="button"
                onClick={() => setSaved(false)}
              >
                Edit profile
              </button>

              <button
                className="profile-reset-button"
                type="button"
                onClick={resetProfile}
              >
                Reset profile
              </button>
            </div>
          </section>

          {result.season && (
            <SeasonalPaletteDisplay season={result.season} />
          )}
        </>
      ) : (
        <section className="profile-wizard">
          <div className="profile-progress">
            <span>STEP {step + 1} OF {QUESTIONS.length}</span>
            <div>
              <span
                style={{
                  width: `${((step + 1) / QUESTIONS.length) * 100}%`,
                }}
              />
            </div>
          </div>

          <div className="eyebrow">
            PERSONAL COLOUR CHARACTERISTICS
          </div>

          <h2>{currentQuestion.title}</h2>
          <p>{currentQuestion.description}</p>

          <div className="profile-options">
            {currentQuestion.options.map((option) => (
              <button
                key={option.value}
                type="button"
                className={
                  profile[currentQuestion.key] === option.value
                    ? "profile-option selected"
                    : "profile-option"
                }
                onClick={() => updateAnswer(option.value)}
              >
                <span className="profile-option-radio" />
                <span>
                  <strong>{option.label}</strong>
                  <small>{option.detail}</small>
                </span>
              </button>
            ))}
          </div>

          {error && <p className="profile-error">{error}</p>}

          <div className="profile-navigation">
            <button
              type="button"
              className="profile-reset-button"
              disabled={step === 0}
              onClick={() => setStep((current) => current - 1)}
            >
              Previous
            </button>

            {step < QUESTIONS.length - 1 ? (
              <button
                type="button"
                className="primary-button"
                onClick={() => setStep((current) => current + 1)}
              >
                Continue
              </button>
            ) : (
              <button
                type="button"
                className="primary-button"
                onClick={saveProfile}
              >
                Save colour profile
              </button>
            )}
          </div>
        </section>
      )}

      <p className="profile-disclaimer">
        This simplified four-season system is an experimental styling
        guide. It is not a scientific assessment or a definitive
        determination of personal colour suitability.
      </p>
    </div>
  );
}
