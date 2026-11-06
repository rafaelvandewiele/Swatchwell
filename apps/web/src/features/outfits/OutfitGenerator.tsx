import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { loadUserStyleData, saveUserStyleData } from "../../lib/user-style-data";
import { getWardrobePhotoUrl } from "../../lib/wardrobe-photos";

import {
  type ColorSeason,
} from "@swatchwell/color-engine";

import {
  analyzeOutfitHarmony,
  generateOutfits,
  type OutfitRecommendation,
} from "@swatchwell/outfit-engine";

import { getSeasonLabel } from "../color-profile/color-profile";

import {
  toGeneratorWardrobe,
  type WardrobeGarment,
} from "../wardrobe/wardrobe-adapter";

import "./OutfitGenerator.css";

interface StoredWardrobeItem extends WardrobeGarment {
  brand: string;
  notes: string;
  imageKey: string;
  createdAt: number;
}

interface StoredOutfit {
  outfit: OutfitRecommendation;
}


function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function isOutfitRecommendation(
  value: unknown,
): value is OutfitRecommendation {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === "string" &&
    typeof value.score === "number" &&
    typeof value.rating === "string" &&
    Array.isArray(value.items) &&
    value.items.every(
      (item: unknown) =>
        isRecord(item) &&
        typeof item.id === "string" &&
        typeof item.name === "string" &&
        typeof item.category === "string" &&
        typeof item.color === "string",
    ) &&
    Array.isArray(value.explanation) &&
    value.explanation.every(
      (note: unknown) => typeof note === "string",
    )
  );
}

function reconcileSavedOutfits(
  saved: StoredOutfit[],
  wardrobe: StoredWardrobeItem[],
  season?: ColorSeason,
): StoredOutfit[] {
  const availableItems = new Map(
    toGeneratorWardrobe(wardrobe).map((item) => [item.id, item]),
  );

  return saved.flatMap(({ outfit }) => {
    const items = outfit.items
      .map((item) => availableItems.get(item.id))
      .filter(
        (item): item is NonNullable<typeof item> =>
          item !== undefined,
      );

    const hasTop = items.some((item) =>
      ["shirt", "tshirt", "polo"].includes(item.category),
    );

    const hasTrousers = items.some(
      (item) => item.category === "pants",
    );

    // Keep only favourites that still form a complete outfit.
    if (!hasTop || !hasTrousers) {
      return [];
    }

    const harmony = analyzeOutfitHarmony(
      items.map((item) => ({
        id: item.id,
        name: item.name,
        color: item.color,
        extraColors: item.extraColors,
      })),
      season,
    );

    const explanation = [...harmony.recommendations];

    if (harmony.seasonalCompatibility !== undefined) {
      explanation.push(
        `Seasonal palette compatibility: ${harmony.seasonalCompatibility}/100.`,
      );
    }

    return [
      {
        outfit: {
          ...outfit,
          id: items.map((item) => item.id).sort().join("-"),
          items,
          score: harmony.score,
          rating: harmony.rating,
          harmony,
          explanation,
        },
      },
    ];
  });
}

function getOutfitDisplayOrder(category: string): number {
  const order: Record<string, number> = {
    shoes: 0,
    pants: 1,
    shirt: 2,
    tshirt: 2,
    polo: 2,
    sweater: 3,
    jacket: 4,
    accessory: 5,
  };

  return order[category] ?? 99;
}

function sortOutfitItems(items: OutfitRecommendation["items"]) {
  return [...items].sort(
    (a, b) =>
      getOutfitDisplayOrder(a.category) -
      getOutfitDisplayOrder(b.category),
  );
}

function OutfitCard({
  outfit,
  index,
  photoUrls,
  isSaved,
  onToggleSave,
}: {
  outfit: OutfitRecommendation;
  index: number;
  photoUrls: Record<string, string>;
  isSaved: boolean;
  onToggleSave: () => void;
}) {
  return (
    <article className="outfit-card">
      <div className="outfit-card-top">
        <div>
          <span className="outfit-eyebrow">
            OUTFIT {String(index + 1).padStart(2, "0")}
          </span>

          <h3>Your combination</h3>
        </div>

        <div className="outfit-score">
          <strong>{outfit.score}</strong>
          <span>/ 100</span>
        </div>
      </div>

      <div className="outfit-rating">
        {outfit.rating} colour compatibility
      </div>

      <div className="outfit-items">
        {sortOutfitItems(outfit.items).map((item) => (
          <div className="outfit-item" key={item.id}>
            <div className="outfit-item-visual">
              {photoUrls[item.id] ? (
                <img
                  className="outfit-item-image"
                  src={photoUrls[item.id]}
                  alt={item.name}
                  loading="lazy"
                />
              ) : (
                <div
                  className="outfit-item-swatch"
                  style={{ backgroundColor: item.color }}
                />
              )}
            </div>

            <div className="outfit-item-details">
              <strong>{item.name}</strong>
              <span>{item.category}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="outfit-explanation">
        <span>THE COLOUR NOTES</span>

        {outfit.explanation.map((note, noteIndex) => (
          <p key={noteIndex}>{note}</p>
        ))}
      </div>

      <button
        className={`outfit-save-button ${isSaved ? "is-saved" : ""}`}
        onClick={onToggleSave}
        type="button"
        aria-label={isSaved ? "Remove saved outfit" : "Save outfit"}
      >
        <span>{isSaved ? "♥" : "♡"}</span>
        {isSaved ? "Saved to favourites" : "Save outfit"}
      </button>
    </article>
  );
}

export default function OutfitGenerator() {
  const [wardrobe, setWardrobe] = useState<StoredWardrobeItem[]>([]);
  const [savedOutfits, setSavedOutfits] = useState<StoredOutfit[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>(
    {},
  );

  const [season, setSeason] = useState<ColorSeason | undefined>(undefined);

  const [saveError, setSaveError] = useState("");

  // Load account-specific wardrobe and saved outfits.
  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let active = true;
    let generation = 0;

    async function loadForUser(id: string | null) {
      const current = ++generation;
      setUserId(id);
      setWardrobe([]);
      setSavedOutfits([]);
      setSeason(undefined);
      setSaveError("");
      setLoading(Boolean(id));

      if (!id) {
        setLoading(false);
        return;
      }

      try {
        const data = await loadUserStyleData();
        if (!active || current !== generation || data?.userId !== id) return;

        setWardrobe(data.wardrobe as StoredWardrobeItem[]);
        setSavedOutfits(
          (data.savedOutfits as StoredOutfit[]).filter(
            (entry) => isRecord(entry) && isOutfitRecommendation(entry.outfit),
          ),
        );
        setSeason(data.colorProfile?.analysis?.season);
      } catch {
        if (active && current === generation) {
          setSaveError("Your personal style data could not be loaded. Please refresh.");
        }
      } finally {
        if (active && current === generation) setLoading(false);
      }
    }

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      void loadForUser(session?.user.id ?? null);
    });

    void supabase.auth.getSession().then(({ data }) => {
      if (active) void loadForUser(data.session?.user.id ?? null);
    });

    return () => {
      active = false;
      generation++;
      data.subscription.unsubscribe();
    };
  }, []);

  // Load photos belonging to the signed-in wardrobe.
  useEffect(() => {
    let cancelled = false;

    setPhotoUrls({});

    async function loadPhotos() {
      const entries = await Promise.all(
        wardrobe.map(async (item) => {
          const url = await getWardrobePhotoUrl(userId!, item.id, item.imageKey);
          if (!url) return null;
          return [item.id, url] as const;
        }),
      );

      if (cancelled) {
        return;
      }

      setPhotoUrls(Object.fromEntries(
        entries.filter((entry): entry is NonNullable<typeof entry> => entry !== null),
      ));
    }

    if (userId && !loading) void loadPhotos();
    return () => {
      cancelled = true;
    };
  }, [wardrobe, userId, loading]);

  // Generate outfit recommendations.
  const result = useMemo(() => {
    try {
      const generatorItems = toGeneratorWardrobe(wardrobe);

      return {
        outfits: generateOutfits(generatorItems, {
          limit: 12,
          ...(season ? { season } : {}),
        }),
        error: "",
      };
    } catch {
      return {
        outfits: [] as OutfitRecommendation[],
        error:
          "Some wardrobe items have invalid data. Please review your wardrobe.",
      };
    }
  }, [wardrobe, season]);

    // Reconcile saved outfits with the current wardrobe.
    const reconciledSavedOutfits = useMemo(
      () => reconcileSavedOutfits(savedOutfits, wardrobe, season),
      [savedOutfits, wardrobe, season],
    );

    // Keep reconciled favourites in the active account.
    useEffect(() => {
      if (!userId || loading) return;
      void saveUserStyleData({ savedOutfits: reconciledSavedOutfits }).catch(() => {
        setSaveError("Your saved outfits could not be synchronised.");
      });
    }, [reconciledSavedOutfits, userId, loading]);

  const topCount = wardrobe.filter((item) =>
    ["Shirts", "T-shirts", "Polo shirts"].includes(item.category),
  ).length;

  const pantsCount = wardrobe.filter(
    (item) => item.category === "Trousers",
  ).length;

    async function toggleSavedOutfit(outfit: OutfitRecommendation) {
      if (!userId || loading) return;

      const alreadySaved = reconciledSavedOutfits.some(
        (saved) => saved.outfit.id === outfit.id,
      );
      const updated = alreadySaved
        ? reconciledSavedOutfits.filter((saved) => saved.outfit.id !== outfit.id)
        : [...reconciledSavedOutfits, { outfit }];

      try {
        await saveUserStyleData({ savedOutfits: updated });
        setSavedOutfits(updated);
        setSaveError("");
      } catch {
        setSaveError("Your changes could not be saved. Please try again.");
      }
    }

  async function refreshWardrobe() {
    if (!userId) return;
    try {
      const data = await loadUserStyleData();
      if (!data || data.userId !== userId) return;
      setWardrobe(data.wardrobe as StoredWardrobeItem[]);
      setSavedOutfits(
        (data.savedOutfits as StoredOutfit[]).filter(
          (entry) => isRecord(entry) && isOutfitRecommendation(entry.outfit),
        ),
      );
      setSeason(data.colorProfile?.analysis?.season);
      setSaveError("");
    } catch {
      setSaveError("Your wardrobe could not be refreshed.");
    }
  }

  function isOutfitSaved(outfitId: string) {
    return reconciledSavedOutfits.some(
      (saved) => saved.outfit.id === outfitId,
    );
  }

  if (!userId && !loading) {
    return (
      <div className="page-content subpage outfit-generator-page">
        <section className="outfit-intro">
          <h1>Your outfits</h1>
          <p>Sign in through your profile to access your personal wardrobe and saved outfits.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="page-content subpage outfit-generator-page">
      <section className="outfit-intro">
        <div className="eyebrow">
          YOUR PERSONAL STYLING ASSISTANT
        </div>

        <h1>
          Get dressed with <em>intention.</em>
        </h1>

        <p>
          Thoughtfully combined outfits, created from the pieces you
          already own.
        </p>

        <button
          className="primary-button"
          onClick={refreshWardrobe}
          type="button"
        >
          Refresh wardrobe <span>↻</span>
        </button>

        <p className="outfit-profile-status">
          {season
            ? `Personalised for your ${getSeasonLabel(season)} colour profile`
            : "Create a colour profile to personalise your outfit suggestions."}
        </p>
      </section>

      <section className="outfit-overview">
        <div>
          <span>YOUR WARDROBE</span>
          <strong>{wardrobe.length}</strong>
          <small>Available pieces</small>
        </div>

        <div>
          <span>TOPS</span>
          <strong>{topCount}</strong>
          <small>Shirts, T-shirts and polos</small>
        </div>

        <div>
          <span>TROUSERS</span>
          <strong>{pantsCount}</strong>
          <small>Available bottoms</small>
        </div>

        <div>
          <span>COMBINATIONS</span>
          <strong>{result.outfits.length}</strong>
          <small>Recommendations</small>
        </div>
      </section>

      {saveError && (
        <div className="outfit-message outfit-error">
          {saveError}
        </div>
      )}

      {result.error && (
        <div className="outfit-message outfit-error">
          {result.error}
        </div>
      )}

      {reconciledSavedOutfits.length > 0 && (
        <section className="outfit-results saved-outfits-section">
          <div className="section-heading">
            <div>
              <div className="eyebrow">
                YOUR PERSONAL COLLECTION
              </div>

              <h2>Saved outfits</h2>
            </div>

            <span>{reconciledSavedOutfits.length} favourites</span>
          </div>

          <div className="outfit-grid">
            {reconciledSavedOutfits.map((saved, index) => (
              <OutfitCard
                key={saved.outfit.id}
                outfit={saved.outfit}
                index={index}
                photoUrls={photoUrls}
                isSaved
                onToggleSave={() =>
                  toggleSavedOutfit(saved.outfit)
                }
              />
            ))}
          </div>
        </section>
      )}

      {!result.error && wardrobe.length === 0 && (
        <div className="outfit-empty">
          <span className="outfit-empty-icon">◇</span>

          <h2>Your wardrobe awaits.</h2>

          <p>
            Add clothing pieces to My Wardrobe before generating
            your first outfits.
          </p>
        </div>
      )}

      {!result.error &&
        wardrobe.length > 0 &&
        result.outfits.length === 0 && (
          <div className="outfit-empty">
            <span className="outfit-empty-icon">◇</span>

            <h2>A few more essentials.</h2>

            <p>
              Add at least one shirt, T-shirt or polo shirt and one pair
              of trousers to create complete outfit combinations.
            </p>
          </div>
        )}

      {result.outfits.length > 0 && (
        <section className="outfit-results">
          <div className="section-heading">
            <div>
              <div className="eyebrow">
                CURATED FOR YOUR WARDROBE
              </div>

              <h2>Your outfit suggestions</h2>
            </div>

            <span>{result.outfits.length} combinations</span>
          </div>

          <div className="outfit-grid">
            {result.outfits.map((outfit, index) => (
              <OutfitCard
                key={outfit.id}
                outfit={outfit}
                index={index}
                photoUrls={photoUrls}
                isSaved={isOutfitSaved(outfit.id)}
                onToggleSave={() => toggleSavedOutfit(outfit)}
              />
            ))}
          </div>

          <p className="outfit-disclaimer">
            Colour scores are experimental estimates based on
            perceptual colour differences and curated palette
            comparisons. They do not represent an objective measure
            of personal style.
          </p>
        </section>
      )}
    </div>
  );
}
