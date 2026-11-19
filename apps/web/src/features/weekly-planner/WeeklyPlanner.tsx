import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ColorSeason } from "@swatchwell/color-engine";
import { generateOutfits } from "@swatchwell/outfit-engine";
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
  sanitizeWeeklyPlanForWardrobe,
  canAccessPremiumPlanner,
  assignOutfitToDay,
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
    worn_at: day.wornAt,
  }));
}

export default function WeeklyPlanner({ isPremium, isAuthenticated, onSignIn, onOpenWardrobe }: WeeklyPlannerProps) {
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
  const [repeatAvoidanceWeeks, setRepeatAvoidanceWeeks] = useState<0 | 2 | 4>(4);
  const [recentHistory, setRecentHistory] = useState<PlannedDay[]>([]);
  const loadGeneration = useRef(0);

  const generatorWardrobe = useMemo(
    () => toGeneratorWardrobe(wardrobe),
    [wardrobe],
  );
  const hasPlannerTop = generatorWardrobe.some((item) => item.category === "tshirt");
  const hasPlannerTrousers = generatorWardrobe.some((item) => item.category === "pants");
  const hasPlannerSweater = generatorWardrobe.some((item) => item.category === "sweater");
  const hasPlannerShoes = generatorWardrobe.some((item) => item.category === "shoes");
  const outfitOptions = useMemo(() => generateOutfits(generatorWardrobe, { limit: 50, requireCompleteLayers: true, ...(season ? { season } : {}) }), [generatorWardrobe, season]);

  const persist = useCallback(async (nextDays: PlannedDay[], nextWeekStart = weekStart, nextRepeatAvoidanceWeeks = repeatAvoidanceWeeks) => {
    if (!supabase || !userId) {
      setError(t("Your changes are visible in this session, but syncing requires a signed-in Premium account."));
      return;
    }
    setSaving(true);
    try {
      const { error: saveError } = await supabase
        .from("user_weekly_plans")
        .upsert({
          user_id: userId,
          week_start: nextWeekStart,
          days: toDbDays(nextDays),
          repeat_avoidance_weeks: nextRepeatAvoidanceWeeks,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id,week_start" });
      if (saveError) throw saveError;
      setHasSavedPlan(true);
      setError("");
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : String(saveError);
      const migrationMissing = /user_weekly_plans|schema cache|does not exist|42P01|PGRST205/i.test(message);
      setError(migrationMissing
        ? t("Your plan is visible in this session, but cloud sync is unavailable until the weekly planner Supabase migration is applied.")
        : t("Your plan is visible in this session, but could not sync to Supabase. Check your connection and try again."));
    } finally {
      setSaving(false);
    }
  }, [userId, weekStart, repeatAvoidanceWeeks, t]);

  const loadWeek = useCallback(async (id: string, targetWeek: string, isActive: () => boolean) => {
    if (!supabase) return;
    const request = ++loadGeneration.current;
    setLoading(true);
    setHasSavedPlan(false);
    setRecentHistory([]);
    setDays(createEmptyWeeklyPlan(targetWeek).days);
    setError("");
    try {
      const historyStart = parseLocalDate(targetWeek);
      historyStart.setDate(historyStart.getDate() - 28);
      const historyStartKey = `${historyStart.getFullYear()}-${String(historyStart.getMonth() + 1).padStart(2, "0")}-${String(historyStart.getDate()).padStart(2, "0")}`;
      const styleData = await loadUserStyleData();
      if (!isActive() || request !== loadGeneration.current) return;
      const { data: currentAuth } = await supabase.auth.getUser();
      if (!isActive() || request !== loadGeneration.current || currentAuth.user?.id !== id) return;
      if (styleData?.userId !== id) throw new Error(t("Your wardrobe could not be loaded. Please refresh."));
      setWardrobe(styleData.wardrobe as StoredWardrobeItem[]);
      setSeason(styleData.colorProfile?.analysis?.season);
      const availableIds = new Set((styleData.wardrobe as StoredWardrobeItem[]).map((item) => item.id));

      const [planResult, historyResult] = await Promise.all([
        supabase.from("user_weekly_plans").select("days,repeat_avoidance_weeks").eq("user_id", id).eq("week_start", targetWeek).maybeSingle(),
        supabase.from("user_weekly_plans").select("days").eq("user_id", id).gte("week_start", historyStartKey).lt("week_start", targetWeek),
      ]);
      if (planResult.error || historyResult.error) {
        const dbError = planResult.error ?? historyResult.error;
        const message = dbError?.message ?? "";
        const migrationMissing = /user_weekly_plans|schema cache|does not exist|42P01|PGRST205/i.test(message);
        setDays(createEmptyWeeklyPlan(targetWeek).days);
        setRecentHistory([]);
        setHasSavedPlan(false);
        setError(migrationMissing
          ? t("Your wardrobe is loaded, but cloud sync is unavailable until the weekly planner Supabase migration is applied.")
          : t("Your wardrobe is loaded, but your saved weekly plan could not be reached."));
        return;
      }
      if (!isActive() || request !== loadGeneration.current) return;
      const normalized = normalizeWeeklyPlan(targetWeek, planResult.data?.days);
      const sanitized = sanitizeWeeklyPlanForWardrobe(normalized, availableIds).days;
      const historical = (historyResult.data ?? []).flatMap((row) => Array.isArray(row.days) ? row.days : []).flatMap((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
        const item = entry as Record<string, unknown>;
        if (typeof item.date !== "string" || !Array.isArray(item.item_ids ?? item.itemIds)) return [];
        const ids = (item.item_ids ?? item.itemIds) as unknown[];
        const itemIds = ids.filter((value): value is string => typeof value === "string" && availableIds.has(value));
        if (itemIds.length < 2 || itemIds.length !== ids.length) return [];
        return [{ date: item.date, occasion: item.occasion === "Formal" || item.occasion === "Sport" || item.occasion === "Smart casual" || item.occasion === "School / work" ? item.occasion : "Everyday", weather: item.weather === "Warm" || item.weather === "Mild" || item.weather === "Cold" ? item.weather : "Any weather", pinned: item.pinned === true, itemIds, wornAt: typeof item.worn_at === "string" ? item.worn_at : null } as PlannedDay];
      });
      setRecentHistory(historical);
      const savedRepeatWindow = planResult.data?.repeat_avoidance_weeks;
      setRepeatAvoidanceWeeks(savedRepeatWindow === 0 || savedRepeatWindow === 2 ? savedRepeatWindow : 4);
      setDays(sanitized);
      setHasSavedPlan(Boolean(planResult.data));
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
        const row = payload.new as { week_start?: string; days?: unknown; repeat_avoidance_weeks?: number };
        if (row.week_start !== weekStart || !Array.isArray(row.days)) return;
        setDays(normalizeWeeklyPlan(weekStart, row.days).days);
        if (row.repeat_avoidance_weeks === 0 || row.repeat_avoidance_weeks === 2 || row.repeat_avoidance_weeks === 4) setRepeatAvoidanceWeeks(row.repeat_avoidance_weeks);
        setHasSavedPlan(true);
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [isPremium, userId, weekStart]);

  const changeDay = async (index: number, patch: Partial<PlannedDay>) => {
    try {
      let next = days.map((day, dayIndex) => dayIndex === index ? { ...day, ...patch } : day);
      const contextChanged = patch.occasion !== undefined || patch.weather !== undefined;
      if (contextChanged && !days[index].pinned && !days[index].wornAt && days[index].itemIds) {
        const cutoff = parseLocalDate(weekStart);
        cutoff.setDate(cutoff.getDate() - repeatAvoidanceWeeks * 7);
        const history = repeatAvoidanceWeeks === 0 ? [] : recentHistory.filter((entry) => parseLocalDate(entry.date) >= cutoff);
        next = regenerateDayOutfit(generatorWardrobe, season, next, index, history).days;
      }
      setDays(next);
      await persist(next);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("Your weekly plan could not be updated."));
    }
  };

  const generateWeek = async () => {
    if (!hasPlannerTop || !hasPlannerTrousers) {
      setError(t("Add at least one top and one pair of trousers to generate complete outfits."));
      return;
    }
    setGenerating(true);
    setError("");
    try {
      const cutoff = parseLocalDate(weekStart);
      cutoff.setDate(cutoff.getDate() - repeatAvoidanceWeeks * 7);
      const history = repeatAvoidanceWeeks === 0 ? [] : recentHistory.filter((entry) => parseLocalDate(entry.date) >= cutoff);
      const generated = generateWeeklyOutfits(generatorWardrobe, season, days, history);
      setDays(generated.days);
      await persist(generated.days);
      const assignedDays = generated.days.filter((day) => day.itemIds?.length).length;
      if (assignedDays < 7) setError(t("Your wardrobe has too few distinct combinations for all seven days. Some days have been left empty."));
      else if (generated.repeatConflicts.length) setError(t("Not enough unique combinations remain to avoid every recent outfit."));
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : t("The weekly plan could not be generated."));
    } finally {
      setGenerating(false);
    }
  };

  const regenerateDay = async (index: number) => {
    if (days[index]?.pinned || days[index]?.wornAt) return;
    setGenerating(true);
    setError("");
    try {
      const cutoff = parseLocalDate(weekStart);
      cutoff.setDate(cutoff.getDate() - repeatAvoidanceWeeks * 7);
      const history = repeatAvoidanceWeeks === 0 ? [] : recentHistory.filter((entry) => parseLocalDate(entry.date) >= cutoff);
      const generated = regenerateDayOutfit(generatorWardrobe, season, days, index, history);
      const next = generated.days;
      if (!next[index]?.itemIds) throw new Error(t("Your wardrobe does not contain enough pieces for a complete outfit."));
      setDays(next);
      await persist(next);
      if (generated.repeatConflict) setError(t("This is the best available outfit, but it was used recently."));
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : t("The outfit could not be regenerated."));
    } finally {
      setGenerating(false);
    }
  };

  const assignOutfit = async (index: number, outfitId: string) => {
    const selected = outfitOptions.find((outfit) => outfit.id === outfitId);
    if (!selected) return;
    const next = assignOutfitToDay(days, index, selected.items.map((item) => item.id));
    setDays(next);
    await persist(next);
  };

  const clearDay = async (index: number) => {
    const next = days.map((day, dayIndex) => dayIndex === index ? { ...day, itemIds: null, pinned: false, wornAt: null } : day);
    setDays(next);
    await persist(next);
  };

  const markWorn = async (index: number) => {
    const next = days.map((day, dayIndex) => dayIndex === index ? { ...day, wornAt: day.wornAt ? null : new Date().toISOString() } : day);
    setDays(next);
    await persist(next);
  };

  const changeRepeatAvoidance = async (value: string) => {
    const next = value === "0" ? 0 : value === "2" ? 2 : 4;
    const previous = repeatAvoidanceWeeks;
    setRepeatAvoidanceWeeks(next);
    try {
      await persist(days, weekStart, next);
    } catch (saveError) {
      setRepeatAvoidanceWeeks(previous);
      setError(saveError instanceof Error ? saveError.message : t("Your weekly plan could not be saved."));
    }
  };

  const moveWeek = (offset: number) => {
    const date = parseLocalDate(weekStart);
    date.setDate(date.getDate() + offset * 7);
    setWeekStart(getWeekStartKey(date));
  };

  const hasAnyOutfit = days.some((day) => day.itemIds?.length);

  const subscribeToPremium = async () => {
    if (!supabase) {
      setError(t("Premium checkout is currently unavailable. Please try again later."));
      return;
    }
    try {
      const { data, error: checkoutError } = await supabase.functions.invoke("create-checkout-session", { body: {} });
      if (checkoutError || !data?.url) throw checkoutError ?? new Error("Checkout URL was not returned.");
      window.location.assign(data.url);
    } catch {
      setError(t("Premium checkout could not be started. Please try again."));
    }
  };

  if (!canAccessPremiumPlanner(isAuthenticated, isPremium)) {
    return (
      <div className="page-content weekly-planner-page premium-required">
        <section className="premium-required-card weekly-planner-premium-card">
          <span className="premium-required-lock">🔒</span>
          <div className="eyebrow">{t("SWATCHWELL PREMIUM")}</div>
          <h1>{t("Your week, thoughtfully planned.")}</h1>
          <p>{t("Plan seven days of complete layered outfits from your own wardrobe. Keep favourite looks in place and avoid repeating the same combination.")}</p>
          <strong>{t("€2.99 per month")}</strong>
          {isAuthenticated
            ? <button className="primary-button" type="button" onClick={() => void subscribeToPremium()}>{t("Subscribe to Premium")} <span>→</span></button>
            : <button className="primary-button" type="button" onClick={onSignIn}>{t("Sign in")}</button>}
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
          <label className="weekly-planner-repeat">{t("Avoid recent repeats")}<select value={String(repeatAvoidanceWeeks)} onChange={(event) => void changeRepeatAvoidance(event.target.value)} disabled={loading || saving || generating}><option value="0">{t("Off")}</option><option value="2">{t("2 weeks")}</option><option value="4">{t("4 weeks")}</option></select></label>
          <span className="weekly-planner-status">{loading ? t("Loading your week...") : saving ? t("Saving...") : hasSavedPlan ? t("Synced to your account") : t("Not saved yet")}</span>
          <button className="primary-button" type="button" onClick={() => void generateWeek()} disabled={loading || saving || generating || !hasPlannerTop || !hasPlannerTrousers || !hasPlannerSweater || !hasPlannerShoes}>
            {generating ? t("Creating your week...") : t("Generate my week")}
          </button>
        </div>
      </div>

      {error && <div className="weekly-planner-error" role="alert">{error}</div>}
      {!loading && wardrobe.length > 0 && !hasPlannerTop && <div className="weekly-planner-error" role="status">{t("Add at least one top to your wardrobe.")}</div>}
      {!loading && wardrobe.length > 0 && !hasPlannerTrousers && <div className="weekly-planner-error" role="status">{t("Add at least one pair of trousers to your wardrobe.")}</div>}

      {!loading && wardrobe.length === 0 && (
        <div className="weekly-planner-empty">
          <h2>{t("Your wardrobe comes first.")}</h2>
          <p>{t("Add a T-shirt, sweater, pair of trousers and shoes. Swatchwell needs all four pieces to build a complete outfit.")}</p>
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
                  {day.wornAt && <small className="weekly-planner-worn">{t("Worn")}</small>}
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

              <select
                className="weekly-planner-outfit-picker"
                value={outfitOptions.find((outfit) => outfit.items.length === day.itemIds?.length && outfit.items.every((item) => day.itemIds?.includes(item.id)))?.id ?? ""}
                onChange={(event) => void assignOutfit(index, event.target.value)}
                disabled={loading || saving || generating || outfitOptions.length === 0}
                aria-label={t("Choose an outfit for this day")}
              >
                <option value="">{t("Choose an outfit")}</option>
                {outfitOptions.map((outfit) => <option key={outfit.id} value={outfit.id}>{outfit.items.map((item) => item.name).join(" + ")}</option>)}
              </select>

              {outfitItems.length > 0 ? (
                <div className="weekly-planner-outfit">
                  {[...outfitItems].sort((a, b) => {
                    const order: Record<string, number> = { sweater: 0, tshirt: 1, pants: 2, shoes: 3, shirt: 4, polo: 4, jacket: 5, accessory: 6 };
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
                {outfitItems.length > 0 && <button type="button" onClick={() => void markWorn(index)} disabled={loading || saving || generating}>{day.wornAt ? t("Undo worn") : t("Mark as worn")}</button>}
                {outfitItems.length > 0 && <button type="button" onClick={() => void clearDay(index)} disabled={loading || saving || generating}>{t("Clear day")}</button>}
                <button type="button" onClick={() => void regenerateDay(index)} disabled={loading || saving || generating || day.pinned || Boolean(day.wornAt) || wardrobe.length === 0}>
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
