import { useEffect, useRef, useState } from "react";

import type {
  SeasonalProfile,
  ColorSeason,
  PaletteColorCategory,
} from "@swatchwell/color-engine";

import {
  getSubSeasonalPalette,
  getSubSeasonLabel,
} from "@swatchwell/color-engine";
import { COLOUR_CLARITY_SWATCHES, SEASONAL_QUESTIONS as QUESTIONS } from "@swatchwell/color-engine";

import { createColorProfile } from "./color-profile";
import { supabase } from "../../lib/supabase";
import { loadUserStyleData, saveUserStyleData } from "../../lib/user-style-data";

import { useI18n } from "../../lib/i18n";
import "./ColorProfile.css";

const INITIAL_PROFILE: SeasonalProfile = {
  undertone: "uncertain",
  value: "uncertain",
  chroma: "uncertain",
  contrast: "uncertain",
};


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

function SeasonalPaletteDisplay({ subSeason }: { subSeason: import('@swatchwell/color-engine').SubSeason }) {
  const { t } = useI18n();
  const palette = getSubSeasonalPalette(subSeason);

  return (
    <section className="seasonal-palette">
      <div className="seasonal-palette-heading">
        <div className="eyebrow">{t("YOUR COLOUR SELECTION")}</div>
        <h3>{t("The")} {t(getSubSeasonLabel(palette.subSeason))} {t("palette")}</h3>
        <p>
          {t("Twelve curated colours to use as inspiration when")}
          {t("building your wardrobe.")}
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
                <h4>{t(category.title)}</h4>
                <p>{t(category.description)}</p>
              </div>
              <span>{String(colors.length).padStart(2, "0")} {t("COLOURS")}</span>
            </div>

            <div className="seasonal-color-grid">
              {colors.map((color) => (
                <article className="seasonal-color-card" key={color.hex}>
                  <div
                    className="seasonal-color-swatch"
                    style={{ backgroundColor: color.hex }}
                    aria-label={`${t(color.name)}, ${color.hex}`}
                    title={`${t(color.name)} — ${color.hex}`}
                  />
                  <div className="seasonal-color-details">
                    <strong>{t(color.name)}</strong>
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
  const { t } = useI18n();
  const [profile, setProfile] = useState<SeasonalProfile>(INITIAL_PROFILE);
  const [storedProfile, setStoredProfile] = useState<ReturnType<typeof createColorProfile> | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const loadVersion = useRef(0);

  const currentQuestion = QUESTIONS[step];
  const result = saved ? storedProfile?.analysis ?? null : null;

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      setError(t("Account storage is not configured."));
      return;
    }

    let active = true;

    async function loadProfile() {
      const version = ++loadVersion.current;
      setLoading(true);
      setStoredProfile(null);
      setProfile(INITIAL_PROFILE);
      setSaved(false);
      setError("");

      try {
        const data = await loadUserStyleData();
        const { data: authData, error: authError } = await supabase!.auth.getUser();
        if (authError) throw authError;
        if (!active || version !== loadVersion.current) return;

        if (!authData.user || !data || data.userId !== authData.user.id) {
          setError(t("Sign in to create and save your personal colour profile."));
          return;
        }

        const candidate = data.colorProfile;
        if (
          candidate &&
          candidate.profile &&
          typeof candidate.profile === "object"
        ) {
          const restored = createColorProfile(candidate.profile);
          setStoredProfile({
            ...restored,
            updatedAt: typeof candidate.updatedAt === "string"
              ? candidate.updatedAt
              : restored.updatedAt,
          });
          setProfile(restored.profile);
          setSaved(true);
        }
      } catch {
        if (active && version === loadVersion.current) {
          setError(t("Your colour profile could not be loaded. Please try again."));
        }
      } finally {
        if (active && version === loadVersion.current) setLoading(false);
      }
    }

    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      loadVersion.current += 1;
      setStoredProfile(null);
      setProfile(INITIAL_PROFILE);
      setSaved(false);
      setLoading(true);
      queueMicrotask(() => {
        if (active) void loadProfile();
      });
    });

    void loadProfile();

    return () => {
      active = false;
      loadVersion.current += 1;
      listener.subscription.unsubscribe();
    };
  }, []);

  function updateAnswer(value: string) {
    setProfile((current) => ({
      ...current,
      [currentQuestion.key]: value,
    }) as SeasonalProfile);
    setSaved(false);
    setStoredProfile(null);
    setError("");
  }

  async function saveProfile() {
    if (!supabase) {
      setError(t("Account storage is not configured."));
      return;
    }

    try {
      setSaving(true);
      setError("");
      const nextProfile = createColorProfile(profile);
      await saveUserStyleData({ colorProfile: nextProfile });

      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!authData.user) throw new Error(t("Sign in required."));

      setStoredProfile(nextProfile);
      setSaved(true);
    } catch {
      setError(t("Your profile could not be saved. Check your connection and sign-in status."));
    } finally {
      setSaving(false);
    }
  }

  async function resetProfile() {
    try {
      setSaving(true);
      setError("");
      await saveUserStyleData({ colorProfile: null });
      setProfile(INITIAL_PROFILE);
      setStoredProfile(null);
      setSaved(false);
      setStep(0);
    } catch {
      setError(t("Your profile could not be removed. Please try again."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-content subpage color-profile-page">
      <section className="color-profile-intro">
        <div className="eyebrow">{t("YOUR PERSONAL COLOUR JOURNEY")}</div>
        <h1>
          {t("Understand your")} <em>{t("colours.")}</em>
        </h1>
        <p className="welcome-copy">
          {t("Explore your personal colour characteristics and discover a palette to guide your wardrobe.")}
        </p>
      </section>

      {loading ? (
        <section className="profile-wizard">
          <p>{t("Loading your account colour profile…")}</p>
        </section>
      ) : saved && result ? (
        <>
          <section className="profile-result">
            <div className="eyebrow">{t("YOUR CURRENT PROFILE")}</div>

            {result.season ? (
              <>
                <h2>{t(getSubSeasonLabel(result.subSeason))}</h2>
                <p>{t(SEASON_DETAILS[result.season].subtitle)}</p>
                <p>{t(SEASON_DETAILS[result.season].description)}</p>
                <p>{t("Result confidence:")} {result.confidence}</p>
              </>
            ) : (
              <>
                <h2>{t(getSubSeasonLabel(result.subSeason))}</h2>
                <p>{t("This is a starting recommendation based on the answers available. You can refine it by updating your answers.")}</p>
              </>
            )}

            <div className="profile-characteristics">
              <div>
                <span>{t("Undertone")}</span>
                <strong>{t(profile.undertone)}</strong>
              </div>
              <div>
                <span>{t("Depth")}</span>
                <strong>{t(profile.value)}</strong>
              </div>
              <div>
                <span>{t("Clarity")}</span>
                <strong>{t(profile.chroma)}</strong>
              </div>
              <div>
                <span>{t("Contrast")}</span>
                <strong>{t(profile.contrast)}</strong>
              </div>
            </div>

            <div className="profile-actions">
              <button
                className="primary-button"
                type="button"
                onClick={() => setSaved(false)}
              >
                {t("Edit profile")}
              </button>

              <button
                className="profile-reset-button"
                type="button"
                onClick={() => void resetProfile()}
                disabled={saving}
              >
                {t("Reset profile")}
              </button>
            </div>
          </section>

          <SeasonalPaletteDisplay subSeason={result.subSeason} />
        </>
      ) : (
        <section className="profile-wizard">
          <div className="profile-progress">
           <span>{t("STEP")} {step + 1} {t("OF")} {QUESTIONS.length}</span>
            <div>
              <span
                style={{
                  width: `${((step + 1) / QUESTIONS.length) * 100}%`,
                }}
              />
            </div>
          </div>

          <div className="eyebrow">
            {t("PERSONAL COLOUR CHARACTERISTICS")}
          </div>

          <h2>{t(currentQuestion.title)}</h2>
          <p>{t(currentQuestion.description)}</p>

          {currentQuestion.key === "chroma" && (
            <div className="clarity-comparison" aria-label={t("Your colour clarity")}>
              <div className="clarity-group">
                <strong>{t("Soft")}</strong>
                <div className="clarity-swatches">
                  {COLOUR_CLARITY_SWATCHES.soft.map((colour, index) => (
                    <span key={colour} role="img" aria-label={`${t("Soft")} ${index + 1}`} style={{ backgroundColor: colour }} />
                  ))}
                </div>
              </div>
              <div className="clarity-group">
                <strong>{t("Clear")}</strong>
                <div className="clarity-swatches">
                  {COLOUR_CLARITY_SWATCHES.clear.map((colour, index) => (
                    <span key={colour} role="img" aria-label={`${t("Clear")} ${index + 1}`} style={{ backgroundColor: colour }} />
                  ))}
                </div>
              </div>
            </div>
          )}

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
                  <strong>{t(option.label)}</strong>
                  <small>{t(option.detail)}</small>
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
              {t("Previous")}
            </button>

            {step < QUESTIONS.length - 1 ? (
              <button
                type="button"
                className="primary-button"
                onClick={() => setStep((current) => current + 1)}
              >
                {t("Continue")}
              </button>
            ) : (
              <button
                type="button"
                className="primary-button"
                onClick={() => void saveProfile()}
                disabled={saving}
              >
                {saving ? t("Saving…") : t("Save colour profile")}
              </button>
            )}
          </div>
        </section>
      )}

      <p className="profile-disclaimer">
        {t("This twelve-profile seasonal system is an experimental styling guide, not a scientific assessment or a definitive determination of personal colour suitability.")}
      </p>
    </div>
  );
}
