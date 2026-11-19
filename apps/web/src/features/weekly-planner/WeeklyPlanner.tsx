import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ColorSeason } from "@swatchwell/color-engine";
import { useI18n, translateCategory } from "../../lib/i18n";
import { supabase } from "../../lib/supabase";
import { loadUserStyleData } from "../../lib/user-style-data";
import { getWardrobePhotoUrl } from "../../lib/wardrobe-photos";
import { toGeneratorWardrobe, type WardrobeGarment } from "../wardrobe/wardrobe-adapter";
import {
  createEmptyWeeklyPlan,
  generateWeeklyOutfits,
  getOutfitForDay,
  getWeekStartKey,
  normalizeWeeklyPlan,
  parseLocalDate,
  regenerateDayOutfit,
  PLANNER_OCCASIONS,
  PLANNER_WEATHER,
  type PlannedDay,
} from "./planner";
import "./WeeklyPlanner.css";

interface StoredWardrobeItem extends WardrobeGarment {
  imageKey?: string;
}

interface WeeklyPlannerProps {
  isPremium: boolean;
  isAuthenticated: boolean;
  onUpgrade: () => void;
  onSignIn: () => void;
  onOpenWardrobe: () => void;
}

function formatWeekLabel(weekStart: string, language: string): string {
  const start = parseLocalDate(weekStart);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const locale = language === "nl" ? "nl-BE" : language === "fr" ? "fr-BE" : language === "de" ? "de-DE" : "en-GB";
  const first = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(start);
  const last = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(end);
  return `${first} – ${last}`;
}

function formatDayLabel(date: string, language: string): { weekday: string; date: string } {
  const parsed = parseLocalDate(date);
  const locale = language === "nl" ? "nl-BE" : language === "fr" ? "fr-BE" : language === "de" ? "de-DE" : "en-GB";
  return {
    weekday: new Intl.DateTimeFormat(locale, { weekday: "long" }).format(parsed),
    date: new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" }).format(parsed),
  };
}

function toDbDays(days: PlannedDay[]) {
  return days.map((day) => ({
    date: day.date,
    occasion: day.occasion,
    weather: day.weather,
    pinned: day.pinned,
    item_ids: day.itemIds,
  }));
}

export default function WeeklyPlanner({ isPremium, isAuthenticated, onUpgrade, onSignIn, onOpenWardrobe }: WeeklyPlannerProps) {
  const { t, language } = useI18n();
  const [userId, setUserId] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState(() => getWeekStartKey(new Date()));
  const [days, setDays] = useState<PlannedDay[]>(() => createEmptyWeeklyPlan(getWeekStartKey(new Date())).days);
  const [wardrobe, setWardrobe] = useState<StoredWardrobeItem[]>([]);
  const [season, setSeason] = useState<ColorSeason | undefined>();
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [hasSavedPlan, setHasSavedPlan] = useState(false);
  const loadGeneration = useRef(0);

  const generatorWardrobe = useMemo(
    () => toGeneratorWardrobe(wardrobe),
    [wardrobe],
  );

  const persist = useCallback(async (nextDays: PlannedDay[], nextWeekStart = weekStart) => {
    if (!supabase || !userId) throw new Error(t("Sign in to save your weekly plan."));
    setSaving(true);
    try {
      const { error: saveError } = await supabase
        .from("user_weekly_plans")
        .upsert({
          user_id: userId,
          week_start: nextWeekStart,
          days: toDbDays(nextDays),
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id,week_start" });
      if (saveError) throw saveError;
      setHasSavedPlan(true);
      setError("");
    } finally {
      setSaving(false);
    }
  }, [userId, weekStart, t]);

  const loadWeek = useCallback(async (id: string, targetWeek: string, isActive: () => boolean) => {
    if (!supabase) return;
    const request = ++loadGeneration.current;
    setLoading(true);
    setHasSavedPlan(false);
    setDays(createEmptyWeeklyPlan(targetWeek).days);
    setError("");
    try {
      const [planResult, styleData] = await Promise.all([
        supabase.from("user_weekly_plans").select("days").eq("user_id", id).eq("week_start", targetWeek).maybeSingle(),
        loadUserStyleData(),
      ]);
      if (planResult.error) throw planResult.error;
      if (!isActive() || request !== loadGeneration.current) return;
      const { data: currentAuth } = await supabase.auth.getUser();
      if (!isActive() || request !== loadGeneration.current || currentAuth.user?.id !== id) return;
      if (styleData?.userId !== id) throw new Error(t("Your wardrobe could not be loaded. Please refresh."));
      setWardrobe(styleData.wardrobe as StoredWardrobeItem[]);
      setSeason(styleData.colorProfile?.analysis?.season);
      const normalized = normalizeWeeklyPlan(targetWeek, planResult.data?.days);
      const availableIds = new Set((styleData.wardrobe as StoredWardrobeItem[]).map((item) => item.id));
      const sanitized = normalized.days.map((day) => {
        if (!day.itemIds || day.itemIds.every((itemId) => availableIds.has(itemId))) return day;
        return { ...day, itemIds: null, pinned: false };
      });
      setDays(sanitized);
      setHasSavedPlan(Boolean(planResult.data));
    } catch (loadError) {
      if (isActive() && request === loadGeneration.current) setError(loadError instanceof Error ? loadError.message : t("The weekly plan could not be loaded."));
    } finally {
      if (isActive() && request === loadGeneration.current) setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!isPremium || !supabase) {
      setLoading(false);
      return;
    }
    let active = true;
    let generation = 0;
    const isActive = () => active;
    const loadForSession = async () => {
      const current = ++generation;
      const { data, error: authError } = await supabase.auth.getUser();
      if (!active || current !== generation) return;
      if (authError || !data.user?.email_confirmed_at) {
        setUserId(null);
        setLoading(false);
        return;
      }
      setUserId(data.user.id);
      await loadWeek(data.user.id, weekStart, isActive);
    };
    void loadForSession();
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      queueMicrotask(() => {
        if (!active) return;
        const id = session?.user.email_confirmed_at ? session.user.id : null;
        setUserId(id);
        if (id) void loadWeek(id, weekStart, isActive);
        else {
          loadGeneration.current++;
          setDays(createEmptyWeeklyPlan(weekStart).days);
          setWardrobe([]);
          setLoading(false);
        }
      });
    });
    return () => {
      active = false;
      generation++;
      loadGeneration.current++;
      authListener.subscription.unsubscribe();
    };
  }, [isPremium, weekStart, loadWeek]);

  useEffect(() => {
    if (!userId || loading || !supabase) {
      setPhotoUrls({});
      return;
    }
    let active = true;
    void Promise.all(wardrobe.map(async (item) => {
      if (!item.imageKey) return null;
      try {
        const url = await getWardrobePhotoUrl(userId, item.id, item.imageKey);
        return url ? [item.id, url] as const : null;
      } catch {
        return null;
      }
    })).then((entries) => {
      if (active) setPhotoUrls(Object.fromEntries(entries.filter((entry): entry is NonNullable<typeof entry> => entry !== null)));
    });
    return () => { active = false; };
  }, [userId, wardrobe, loading]);

  useEffect(() => {
    if (!isPremium || !userId || !supabase) return;
    const channel = supabase
      .channel(`weekly-plan-${userId}-${weekStart}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "user_weekly_plans",
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        const row = payload.new as { week_start?: string; days?: unknown };
        if (row.week_start !== weekStart || !Array.isArray(row.days)) return;
        setDays(normalizeWeeklyPlan(weekStart, row.days).days);
        setHasSavedPlan(true);
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [isPremium, userId, weekStart]);

  const changeDay = async (index: number, patch: Partial<PlannedDay>) => {
    try {
      let next = days.map((day, dayIndex) => dayIndex === index ? { ...day, ...patch } : day);
      const contextChanged = patch.occasion !== undefined || patch.weather !== undefined;
      if (contextChanged && !days[index].pinned && days[index].itemIds) {
        next = regenerateDayOutfit(generatorWardrobe, season, next, index).days;
      }
      setDays(next);
      await persist(next);
    } catch (saveError) {
      setDays(days);
      setError(saveError instanceof Error ? saveError.message : t("Your weekly plan could not be saved."));
    }
  };

  const generateWeek = async () => {
    const hasTop = generatorWardrobe.some((item) => ["shirt", "tshirt", "polo"].includes(item.category));
    const hasTrousers = generatorWardrobe.some((item) => item.category === "pants");
    if (!hasTop || !hasTrousers) {
      setError(t("Add at least one top and one pair of trousers to generate complete outfits."));
      return;
    }
    setGenerating(true);
    setError("");
    try {
      const generated = generateWeeklyOutfits(generatorWardrobe, season, days);
      await persist(generated.days);
      setDays(generated.days);
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : t("The weekly plan could not be generated."));
    } finally {
      setGenerating(false);
    }
  };

  const regenerateDay = async (index: number) => {
    if (days[index]?.pinned) return;
    setGenerating(true);
    setError("");
    try {
      const generated = regenerateDayOutfit(generatorWardrobe, season, days, index);
      const next = generated.days;
      if (!next[index]?.itemIds) throw new Error(t("Your wardrobe does not contain enough pieces for a complete outfit."));
      await persist(next);
      setDays(next);
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : t("The outfit could not be regenerated."));
    } finally {
      setGenerating(false);
    }
  };

  const moveWeek = (offset: number) => {
    const date = parseLocalDate(weekStart);
    date.setDate(date.getDate() + offset * 7);
    setWeekStart(getWeekStartKey(date));
  };

  const hasAnyOutfit = days.some((day) => day.itemIds?.length);

  if (!isPremium) {
    return (
      <div className="page-content weekly-planner-page">
        <section className="weekly-planner-gate">
          <div className="eyebrow">{t("SWATCHWELL PREMIUM")}</div>
          <h1>{t("Your week, thoughtfully planned.")}</h1>
          <p>{isAuthenticated
            ? t("Plan seven days of outfits from your own wardrobe, keep favourite days in place and avoid repeating the same look unnecessarily.")
            : t("Sign in to check your Premium access and sync your week across devices.")}</p>
          <button className="primary-button" type="button" onClick={isAuthenticated ? onUpgrade : onSignIn}>{isAuthenticated ? t("Explore Premium") : t("Sign in")}</button>
        </section>
      </div>
    );
  }

  if (!supabase) {
    return <div className="page-content weekly-planner-page"><div className="weekly-planner-error">{t("Account storage is not configured.")}</div></div>;
  }

  if (!userId && !loading) {
    return (
      <div className="page-content weekly-planner-page">
        <section className="weekly-planner-gate">
          <div className="eyebrow">{t("SWATCHWELL PREMIUM")}</div>
          <h1>{t("Sign in to sync your week.")}</h1>
          <p>{t("Your weekly plans are saved securely to your account and available on your other devices.")}</p>
          <button className="primary-button" type="button" onClick={onSignIn}>{t("Sign in")}</button>
        </section>
      </div>
    );
  }

  return (
    <div className="page-content weekly-planner-page">
      <header className="weekly-planner-intro">
        <div>
          <div className="eyebrow">{t("SWATCHWELL PREMIUM · YOUR WEEK")}</div>
          <h1>{t("A week,")} <em>{t("well dressed.")}</em></h1>
          <p>{t("Seven days of considered outfits, selected from the pieces you already own. Pin the looks you love and refresh the rest.")}</p>
        </div>
      </header>

      <div className="weekly-planner-toolbar">
        <div className="weekly-planner-week-switch">
          <button type="button" onClick={() => moveWeek(-1)} disabled={loading || saving || generating} aria-label={t("Previous week")}>←</button>
          <strong>{formatWeekLabel(weekStart, language)}</strong>
          <button type="button" onClick={() => moveWeek(1)} disabled={loading || saving || generating} aria-label={t("Next week")}>→</button>
          <button type="button" onClick={() => setWeekStart(getWeekStartKey(new Date()))} disabled={loading || saving || generating}>{t("This week")}</button>
        </div>
        <div className="weekly-planner-actions">
          <span className="weekly-planner-status">{loading ? t("Loading your week...") : saving ? t("Saving...") : hasSavedPlan ? t("Synced to your account") : t("Not saved yet")}</span>
          <button className="primary-button" type="button" onClick={() => void generateWeek()} disabled={loading || saving || generating || !generatorWardrobe.some((item) => ["shirt", "tshirt", "polo"].includes(item.category)) || !generatorWardrobe.some((item) => item.category === "pants")}>
            {generating ? t("Creating your week...") : t("Generate my week")}
          </button>
        </div>
      </div>

      {error && <div className="weekly-planner-error" role="alert">{error}</div>}

      {!loading && wardrobe.length === 0 && (
        <div className="weekly-planner-empty">
          <h2>{t("Your wardrobe comes first.")}</h2>
          <p>{t("Add a few tops and trousers to your wardrobe. Swatchwell will use those pieces to build complete outfits.")}</p>
          <button className="primary-button" type="button" onClick={onOpenWardrobe}>{t("Open my wardrobe")}</button>
        </div>
      )}

      <div className="weekly-planner-grid">
        {days.map((day, index) => {
          const label = formatDayLabel(day.date, language);
          const outfitItems = getOutfitForDay(day, generatorWardrobe);
          return (
            <article className={`weekly-planner-day ${day.pinned ? "is-pinned" : ""}`} key={day.date}>
              <div className="weekly-planner-day-header">
                <div>
                  <span>{label.date}</span>
                  <h2>{label.weekday}</h2>
                </div>
                <button className="weekly-planner-pin" type="button" aria-pressed={day.pinned} aria-label={day.pinned ? t("Unpin outfit") : t("Pin outfit")} title={day.pinned ? t("Unpin outfit") : t("Pin outfit")} onClick={() => void changeDay(index, { pinned: !day.pinned })} disabled={loading || saving || generating || !day.itemIds}>
                  {day.pinned ? "◆" : "◇"}
                </button>
              </div>

              <select value={day.occasion} onChange={(event) => void changeDay(index, { occasion: event.target.value as PlannedDay["occasion"] })} disabled={loading || saving || generating} aria-label={t("Day context")}>
                {PLANNER_OCCASIONS.map((occasion) => <option key={occasion} value={occasion}>{t(occasion)}</option>)}
              </select>
              <select value={day.weather} onChange={(event) => void changeDay(index, { weather: event.target.value as PlannedDay["weather"] })} disabled={loading || saving || generating} aria-label={t("Weather preference")}>
                {PLANNER_WEATHER.map((weather) => <option key={weather} value={weather}>{t(weather)}</option>)}
              </select>

              {outfit ? (
                <div className="weekly-planner-outfit">
                  {[...outfitItems].sort((a, b) => {
                    const order: Record<string, number> = { shoes: 0, pants: 1, shirt: 2, tshirt: 2, polo: 2, sweater: 3, jacket: 4, accessory: 5 };
                    return (order[a.category] ?? 99) - (order[b.category] ?? 99);
                  }).map((item) => {
                    const wardrobeItem = wardrobe.find((entry) => entry.id === item.id);
                    return (
                      <div className="weekly-planner-garment" key={item.id}>
                        <div className="weekly-planner-swatch" style={{ backgroundColor: item.color }}>
                          {photoUrls[item.id] ? <img src={photoUrls[item.id]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
                        </div>
                        <div>
                          <strong>{item.name}</strong>
                          <small>{translateCategory(wardrobeItem?.category ?? item.category, t)}</small>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="weekly-planner-empty">{t("No outfit assigned yet. Generate your week to fill this day.")}</div>
              )}

              <div className="weekly-planner-day-actions">
                <button type="button" onClick={() => void regenerateDay(index)} disabled={loading || saving || generating || day.pinned || wardrobe.length === 0}>
                  ↻ {t("Refresh this day")}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {hasAnyOutfit && <p className="weekly-planner-notice">{t("Your plan is stored in your Swatchwell account and syncs across devices. Pinned outfits stay in place when you generate the week again. Day context and temperature preference influence the outfit ranking; temperature is a manual preference, not a live weather forecast.")}</p>}
    </div>
  );
}
