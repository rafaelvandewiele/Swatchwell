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
import { SEASONAL_QUESTIONS as QUESTIONS } from "@swatchwell/color-engine";

import { createColorProfile } from "./color-profile";
import { supabase } from "../../lib/supabase";
import { loadUserStyleData, saveUserStyleData } from "../../lib/user-style-data";

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
  const palette = getSubSeasonalPalette(subSeason);

  return (
    <section className="seasonal-palette">
      <div className="seasonal-palette-heading">
        <div className="eyebrow">YOUR COLOUR SELECTION</div>
        <h3>The {getSubSeasonLabel(palette.subSeason)} palette</h3>
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
      setError("Account storage is not configured.");
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
          setError("Sign in to create and save your personal colour profile.");
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
          setError("Your colour profile could not be loaded. Please try again.");
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
      setError("Account storage is not configured.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      const nextProfile = createColorProfile(profile);
      await saveUserStyleData({ colorProfile: nextProfile });

      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!authData.user) throw new Error("Sign in required.");

      setStoredProfile(nextProfile);
      setSaved(true);
    } catch {
      setError("Your profile could not be saved. Check your connection and sign-in status.");
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
      setError("Your profile could not be removed. Please try again.");
    } finally {
      setSaving(false);
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

      {loading ? (
        <section className="profile-wizard">
          <p>Loading your account colour profile…</p>
        </section>
      ) : saved && result ? (
        <>
          <section className="profile-result">
            <div className="eyebrow">YOUR CURRENT PROFILE</div>

            {result.season ? (
              <>
                <h2>{getSubSeasonLabel(result.subSeason)}</h2>
                <p>{SEASON_DETAILS[result.season].subtitle}</p>
                <p>{SEASON_DETAILS[result.season].description}</p>
                <p>Result confidence: {result.confidence}</p>
              </>
            ) : (
              <>
                <h2>{getSubSeasonLabel(result.subSeason)}</h2>
                <p>This is a starting recommendation based on the answers available. You can refine it by updating your answers.</p>
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
                onClick={() => void resetProfile()}
                disabled={saving}
              >
                Reset profile
              </button>
            </div>
          </section>

          <SeasonalPaletteDisplay subSeason={result.subSeason} />
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
                onClick={() => void saveProfile()}
                disabled={saving}
              >
                {saving ? "Saving…" : "Save colour profile"}
              </button>
            )}
          </div>
        </section>
      )}

      <p className="profile-disclaimer">
        This twelve-profile seasonal system is an experimental styling guide, not a scientific assessment or a definitive determination of personal colour suitability.
      </p>
    </div>
  );
}
