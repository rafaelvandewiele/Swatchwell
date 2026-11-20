import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { loadUserStyleData, saveUserStyleData } from "../../lib/user-style-data";
import { getWardrobePhotoUrl } from "../../lib/wardrobe-photos";
import { useI18n } from "../../lib/i18n";

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
  sortOutfitLayers,
  type WardrobeGarment,
} from "../wardrobe/wardrobe-adapter";

import "./OutfitGenerator.css";
import { filterRecentOutfits, isGarmentAvailable, outfitSignature, type GarmentStatusRecord, type OutfitWearRecord } from "../outfit-history/rotation";

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
      item.category === "tshirt",
    );

    const hasTrousers = items.some((item) => item.category === "pants");
    const hasSweater = items.some((item) => item.category === "sweater");
    const hasShoes = items.some((item) => item.category === "shoes");

    // Keep only favourites that still form a complete outfit.
    if (!hasTop || !hasTrousers || !hasSweater || !hasShoes) {
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

function OutfitCard({
  outfit,
  index,
  photoUrls,
  isSaved,
  onToggleSave,
  onMarkWorn,
  isPremium,
}: {
  outfit: OutfitRecommendation;
  index: number;
  photoUrls: Record<string, string>;
  isSaved: boolean;
  onToggleSave: () => void;
  onMarkWorn: () => void;
  isPremium: boolean;
}) {
  const { t } = useI18n();

  return (
    <article className="outfit-card">
      <div className="outfit-card-top">
        <div>
          <span className="outfit-eyebrow">
            {t("OUTFIT")} {String(index + 1).padStart(2, "0")}
          </span>

          <h3>{t("Your combination")}</h3>
        </div>

        <div className="outfit-score">
          <strong>{outfit.score}</strong>
          <span>/ 100</span>
        </div>
      </div>

      <div className="outfit-rating">
        {t(outfit.rating)} {t("colour compatibility")}
      </div>

      <div className="outfit-items">
        {sortOutfitLayers(outfit.items).map((item) => (
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
              <span>{t(item.category)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="outfit-explanation outfit-style-commentary">
        <span>{t("THE STYLE NOTES")}</span>
        <p>{t(outfit.harmony.styleCommentary)}</p>
      </div>

      <div className="outfit-explanation">
        <span>{t("THE COLOUR NOTES")}</span>

        {outfit.explanation.map((note, noteIndex) => (
          <p key={noteIndex}>
            {note.startsWith("Seasonal palette compatibility:")
              ? `${t("Seasonal palette compatibility")}${note.slice("Seasonal palette compatibility".length)}`
              : t(note)}
          </p>
        ))}
      </div>

      {isPremium && <button className="outfit-mark-worn-button" type="button" onClick={onMarkWorn}>{t("Mark as worn")}</button>}

      <button
        className={`outfit-save-button ${isSaved ? "is-saved" : ""}`}
        onClick={onToggleSave}
        type="button"
        aria-label={isSaved ? t("Remove saved outfit") : t("Save outfit")}
      >
        <span>{isSaved ? "♥" : "♡"}</span>
        {isSaved ? t("Saved to favourites") : t("Save outfit")}
      </button>
    </article>
  );
}

export default function OutfitGenerator({ isPremium = false }: { isPremium?: boolean }) {
  const { t } = useI18n();
  const [wardrobe, setWardrobe] = useState<StoredWardrobeItem[]>([]);
  const [savedOutfits, setSavedOutfits] = useState<StoredOutfit[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [garmentStatuses, setGarmentStatuses] = useState<GarmentStatusRecord[]>([]);
  const [wearHistory, setWearHistory] = useState<OutfitWearRecord[]>([]);
  const [repeatDays, setRepeatDays] = useState(7);
  const [includeUnavailable, setIncludeUnavailable] = useState(false);

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
        const [statusResult, historyResult, profileResult] = await Promise.all([
          supabase.from("user_garment_statuses").select("item_id,status").eq("user_id", id),
          supabase.from("user_outfit_wear_events").select("id,item_ids,outfit_name,worn_on").eq("user_id", id).order("worn_on", { ascending: false }),
          supabase.from("user_outfit_rotation_settings").select("repeat_days").eq("user_id", id).maybeSingle(),
        ]);
        if (statusResult.error) throw statusResult.error;
        if (historyResult.error) throw historyResult.error;
        setGarmentStatuses((statusResult.data ?? []) as GarmentStatusRecord[]);
        setWearHistory((historyResult.data ?? []) as OutfitWearRecord[]);
        setRepeatDays([0,7,14,30].includes(profileResult.data?.repeat_days) ? profileResult.data!.repeat_days : 7);
      } catch {
        if (active && current === generation) {
          setSaveError(t("Your personal style data could not be loaded. Please refresh."));
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
      const generatorItems = toGeneratorWardrobe(wardrobe).filter((item) => isGarmentAvailable(garmentStatuses.find((status) => status.item_id === item.id)?.status, includeUnavailable));

      const generated = generateOutfits(generatorItems, {
        limit: 50,
        requireCompleteLayers: true,
        ...(season ? { season } : {}),
      });
      const today = new Date().toISOString().slice(0, 10);
      const recent = filterRecentOutfits(wearHistory, today, repeatDays);
      const recentSignatures = new Set(recent.map((entry) => outfitSignature(entry.item_ids)));
      return {
        outfits: generated.filter((outfit) => !recentSignatures.has(outfitSignature(outfit.items.map((item) => item.id)))),
        error: "",
      };
    } catch {
      return {
        outfits: [] as OutfitRecommendation[],
        error:
          t("Some wardrobe items have invalid data. Please review your wardrobe."),
      };
    }
  }, [wardrobe, season, garmentStatuses, includeUnavailable, wearHistory, repeatDays]);

    // Reconcile saved outfits with the current wardrobe.
    const reconciledSavedOutfits = useMemo(
      () => reconcileSavedOutfits(savedOutfits, wardrobe.filter((item) => isGarmentAvailable(garmentStatuses.find((status) => status.item_id === item.id)?.status, includeUnavailable)), season),
      [savedOutfits, wardrobe, season, garmentStatuses, includeUnavailable],
    );

    // Keep reconciled favourites in the active account.
    useEffect(() => {
      if (!userId || loading) return;
      void saveUserStyleData({ savedOutfits: reconciledSavedOutfits }).catch(() => {
        setSaveError(t("Your saved outfits could not be synchronised."));
      });
    }, [reconciledSavedOutfits, userId, loading]);

  const topCount = wardrobe.filter((item) =>
    ["Shirts", "T-shirts", "Polo shirts"].includes(item.category),
  ).length;

  const pantsCount = wardrobe.filter(
    (item) => item.category === "Trousers",
  ).length;

    async function markOutfitWorn(outfit: OutfitRecommendation) {
      if (!userId || !supabase) return;
      const date = new Date().toISOString().slice(0,10);
      const itemIds = outfit.items.map((item) => item.id);
      const { error } = await supabase.from("user_outfit_wear_events").insert({ user_id: userId, item_ids: itemIds, outfit_name: outfit.items.map((item) => item.name).join(" + "), worn_on: date });
      if (error) { setSaveError(error.message); return; }
      const { error: garmentError } = await supabase.from("user_garment_wear_events").upsert(itemIds.map((item_id) => ({ user_id: userId, item_id, worn_on: date })), { onConflict: "user_id,item_id,worn_on", ignoreDuplicates: true });
      if (garmentError) { setSaveError(garmentError.message); return; }
      setWearHistory((current) => [{ id: crypto.randomUUID(), item_ids: itemIds, outfit_name: outfit.items.map((item) => item.name).join(" + "), worn_on: date }, ...current]);
      setSaveError("");
    }

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
        setSaveError(t("Your changes could not be saved. Please try again."));
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
      setSaveError(t("Your wardrobe could not be refreshed."));
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
          <h1>{t("Your outfits")}</h1>
          <p>{t("Sign in through your profile to access your personal wardrobe and saved outfits.")}</p>
        </section>
      </div>
    );
  }

  return (
    <div className="page-content subpage outfit-generator-page">
      <section className="outfit-intro">
        <div className="eyebrow">
          {t("YOUR PERSONAL STYLING ASSISTANT")}
        </div>

        <h1>
          {t("Get dressed with")} <em>{t("intention.")}</em>
        </h1>

        <p>
          {t("Thoughtfully combined outfits, created from the pieces you already own.")}
        </p>

        <button
          className="primary-button"
          onClick={refreshWardrobe}
          type="button"
        >
          {t("Refresh wardrobe")} <span>↻</span>
        </button>

        <p className="outfit-profile-status">
          {season
            ? `${t("Personalised for your")} ${t(getSeasonLabel(season))} ${t("colour profile")}`
            : t("Create a colour profile to personalise your outfit suggestions.")}
        </p>
      </section>

      <section className="outfit-rotation-controls"><label><input type="checkbox" checked={includeUnavailable} onChange={(event) => setIncludeUnavailable(event.target.checked)} /> {t("Include unavailable garments")}</label><label>{t("Avoid recent repeats")} <select value={repeatDays} onChange={async (event) => { const value=Number(event.target.value); setRepeatDays(value); if(userId&&supabase){const {error}=await supabase.from("user_outfit_rotation_settings").upsert({user_id:userId,repeat_days:value,updated_at:new Date().toISOString()},{onConflict:"user_id"});if(error)setSaveError(error.message);} }}><option value={0}>{t("Off")}</option><option value={7}>{t("7 days")}</option><option value={14}>{t("14 days")}</option><option value={30}>{t("30 days")}</option></select></label></section>

      <section className="outfit-overview">
        <div>
          <span>{t("YOUR WARDROBE")}</span>
          <strong>{wardrobe.length}</strong>
          <small>{t("Available pieces")}</small>
        </div>

        <div>
          <span>{t("TOPS")}</span>
          <strong>{topCount}</strong>
          <small>{t("Shirts, T-shirts and polos")}</small>
        </div>

        <div>
          <span>{t("TROUSERS")}</span>
          <strong>{pantsCount}</strong>
          <small>{t("Available bottoms")}</small>
        </div>

        <div>
          <span>{t("COMBINATIONS")}</span>
          <strong>{result.outfits.length}</strong>
          <small>{t("Recommendations")}</small>
        </div>
      </section>

      {saveError && (
        <div className="outfit-message outfit-error">
          {saveError}
        </div>
      )}

      {result.error && (
        <div className="outfit-message outfit-error">
          {t(result.error)}
        </div>
      )}

      {reconciledSavedOutfits.length > 0 && (
        <section className="outfit-results saved-outfits-section">
          <div className="section-heading">
            <div>
              <div className="eyebrow">
                {t("YOUR PERSONAL COLLECTION")}
              </div>

              <h2>{t("Saved outfits")}</h2>
            </div>

            <span>{reconciledSavedOutfits.length} {t("favourites")}</span>
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
                onMarkWorn={() => void markOutfitWorn(saved.outfit)}\n                isPremium={isPremium}
              />
            ))}
          </div>
        </section>
      )}

      {!result.error && wardrobe.length === 0 && (
        <div className="outfit-empty">
          <span className="outfit-empty-icon">◇</span>

          <h2>{t("Your wardrobe awaits.")}</h2>

          <p>
            {t("Add clothing pieces to My Wardrobe before generating your first outfits.")}
          </p>
        </div>
      )}

      {!result.error &&
        wardrobe.length > 0 &&
        result.outfits.length === 0 && (
          <div className="outfit-empty">
            <span className="outfit-empty-icon">◇</span>

            <h2>{t("A few more essentials.")}</h2>

            <p>
              {t("Add at least one shirt, T-shirt or polo shirt and one pair of trousers to create complete outfit combinations.")}
            </p>
          </div>
        )}

      {result.outfits.length > 0 && (
        <section className="outfit-results">
          <div className="section-heading">
            <div>
              <div className="eyebrow">
                {t("CURATED FOR YOUR WARDROBE")}
              </div>

              <h2>{t("Your outfit suggestions")}</h2>
            </div>

            <span>{result.outfits.length} {t("combinations")}</span>
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
                onMarkWorn={() => void markOutfitWorn(outfit)}\n                isPremium={isPremium}
                onMarkWorn={() => void markOutfitWorn(outfit)}
              />
            ))}
          </div>

          <p className="outfit-disclaimer">
            {t("Colour scores are experimental estimates based on perceptual colour differences and curated palette comparisons. They do not represent an objective measure of personal style.")}
          </p>
        </section>
      )}
    </div>
  );
}
