import { useCallback, useEffect, useMemo, useState } from "react";
import { generateOutfits } from "@swatchwell/outfit-engine";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabase";
import { useI18n, translateCategory } from "../../lib/i18n";
import { loadUserStyleData } from "../../lib/user-style-data";
import { getWardrobePhotoUrl } from "../../lib/wardrobe-photos";
import { toGeneratorWardrobe, type WardrobeGarment } from "../wardrobe/wardrobe-adapter";
import {
  buildGarmentInsights,
  buildOutfitUsage,
  getCategoryDistribution,
  getColourDistribution,
  type GarmentWearEvent,
} from "./insights";
import "./wardrobe-insights.css";

interface StoredGarment extends WardrobeGarment {
  imageKey?: string;
  purchasePrice?: number;
}

interface Props {
  isPremium: boolean;
  isAuthenticated: boolean;
  onSignIn: () => void;
}

function todayKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function WardrobeInsights({ isPremium, isAuthenticated, onSignIn }: Props) {
  const { t, language } = useI18n();
  const [userId, setUserId] = useState<string | null>(null);
  const [wardrobe, setWardrobe] = useState<StoredGarment[]>([]);
  const [events, setEvents] = useState<GarmentWearEvent[]>([]);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [logDate, setLogDate] = useState(todayKey);
  const [loading, setLoading] = useState(true);
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refreshEvents = useCallback(async (id: string) => {
    if (!supabase) return;
    const { data, error: queryError } = await supabase
      .from("user_garment_wear_events")
      .select("id,item_id,worn_on")
      .eq("user_id", id)
      .order("worn_on", { ascending: false });
    if (queryError) throw queryError;
    setEvents((data ?? []) as GarmentWearEvent[]);
  }, []);

  useEffect(() => {
    if (!isPremium || !supabase) {
      setLoading(false);
      return;
    }
    let active = true;
    let generation = 0;
    let channel: RealtimeChannel | null = null;

    const load = async () => {
      const current = ++generation;
      setLoading(true);
      setError("");
      try {
        const { data: auth, error: authError } = await supabase!.auth.getUser();
        if (authError || !auth.user?.email_confirmed_at) {
          if (active) {
            setUserId(null);
            setWardrobe([]);
            setEvents([]);
          }
          return;
        }
        const id = auth.user.id;
        const [style, wearResult] = await Promise.all([
          loadUserStyleData(),
          supabase!.from("user_garment_wear_events").select("id,item_id,worn_on").eq("user_id", id).order("worn_on", { ascending: false }),
        ]);
        if (wearResult.error) throw wearResult.error;
        if (!active || current !== generation || style?.userId !== id) return;
        const items = style.wardrobe.filter((item): item is StoredGarment => Boolean(item && typeof item === "object" && "id" in item && "name" in item && "category" in item && "color" in item)) as StoredGarment[];
        setUserId(id);
        setWardrobe(items);
        setEvents((wearResult.data ?? []) as GarmentWearEvent[]);
        const photoEntries = await Promise.all(items.map(async (item) => {
          if (!item.imageKey) return null;
          try {
            const url = await getWardrobePhotoUrl(id, item.id, item.imageKey);
            return url ? [item.id, url] as const : null;
          } catch {
            return null;
          }
        }));
        if (active && current === generation) setPhotos(Object.fromEntries(photoEntries.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))));
        channel = supabase!.channel("wardrobe-insights-" + id).on("postgres_changes", {
          event: "*", schema: "public", table: "user_garment_wear_events", filter: "user_id=eq." + id,
        }, () => {
          void refreshEvents(id).catch((e) => setError(e instanceof Error ? e.message : t("Wear data could not be refreshed.")));
        }).subscribe();
      } catch (e) {
        if (active && current === generation) {
          const message = e instanceof Error ? e.message : "";
          setError(/user_garment_wear_events|schema cache|does not exist|42P01|PGRST205/i.test(message)
            ? t("Apply the Wardrobe Insights Supabase migration to enable private wear tracking.")
            : message || t("Your wardrobe insights could not be loaded."));
        }
      } finally {
        if (active && current === generation) setLoading(false);
      }
    };

    void load();
    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      queueMicrotask(() => { if (active) void load(); });
    });
    return () => {
      active = false;
      generation++;
      authListener.subscription.unsubscribe();
      if (channel && supabase) void supabase.removeChannel(channel);
    };
  }, [isPremium, refreshEvents, t]);

  const insights = useMemo(() => buildGarmentInsights(wardrobe, events), [wardrobe, events]);
  const sortedByWear = useMemo(() => [...insights].sort((a, b) => b.wearCount - a.wearCount || a.item.name.localeCompare(b.item.name)), [insights]);
  const underused = useMemo(() => insights.filter((entry) => entry.wearCount === 0 || (entry.daysSinceWorn !== null && entry.daysSinceWorn >= 30)).sort((a, b) => a.wearCount - b.wearCount || (b.daysSinceWorn ?? 9999) - (a.daysSinceWorn ?? 9999)), [insights]);
  const categories = useMemo(() => getCategoryDistribution(wardrobe), [wardrobe]);
  const colours = useMemo(() => getColourDistribution(wardrobe), [wardrobe]);
  const outfitUsage = useMemo(() => buildOutfitUsage(events), [events]);
  const itemById = useMemo(() => new Map(wardrobe.map((item) => [item.id, item])), [wardrobe]);
  const suggestedOutfits = useMemo(() => {
    if (!wardrobe.length || !underused.length) return [];
    const underusedIds = new Set(underused.map((entry) => entry.item.id));
    return generateOutfits(toGeneratorWardrobe(wardrobe), { limit: 40, requireCompleteLayers: true })
      .map((outfit) => ({ ...outfit, underusedCount: outfit.items.filter((item) => underusedIds.has(item.id)).length }))
      .filter((outfit) => outfit.underusedCount > 0)
      .sort((a, b) => b.underusedCount - a.underusedCount || b.score - a.score)
      .slice(0, 4);
  }, [wardrobe, underused]);
  const totalWearEvents = events.length;
  const trackedOutfits = outfitUsage.length;
  const locale = language === "nl" ? "nl-BE" : language === "fr" ? "fr-BE" : language === "de" ? "de-DE" : "en-GB";
  const money = (amount: number) => new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(amount);
  const dateLabel = (value: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(value + "T12:00:00"));

  const logWear = async (itemId: string) => {
    if (!supabase || !userId) return;
    setBusyItem(itemId);
    setError("");
    setNotice("");
    try {
      const { error: insertError } = await supabase.from("user_garment_wear_events").upsert({
        user_id: userId, item_id: itemId, worn_on: logDate,
      }, { onConflict: "user_id,item_id,worn_on", ignoreDuplicates: true });
      if (insertError) throw insertError;
      await refreshEvents(userId);
      setNotice(t("Wear date saved."));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Wear date could not be saved."));
    } finally {
      setBusyItem(null);
    }
  };

  const deleteEvent = async (event: GarmentWearEvent) => {
    if (!supabase || !userId) return;
    setBusyItem(event.id);
    setError("");
    try {
      const { error: deleteError } = await supabase.from("user_garment_wear_events").delete().eq("id", event.id).eq("user_id", userId);
      if (deleteError) throw deleteError;
      await refreshEvents(userId);
      setNotice(t("Wear record removed."));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Wear record could not be removed."));
    } finally {
      setBusyItem(null);
    }
  };

  const resetEvents = async () => {
    if (!supabase || !userId || !window.confirm(t("Reset all recorded wear dates? This cannot be undone."))) return;
    setBusyItem("reset");
    setError("");
    try {
      const { error: deleteError } = await supabase.from("user_garment_wear_events").delete().eq("user_id", userId);
      if (deleteError) throw deleteError;
      setEvents([]);
      setNotice(t("All wear records have been reset."));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Wear records could not be reset."));
    } finally {
      setBusyItem(null);
    }
  };

  const checkout = async () => {
    if (!supabase) return;
    const { data, error: checkoutError } = await supabase.functions.invoke("create-checkout-session", { body: {} });
    if (checkoutError || !data?.url) {
      setError(t("Premium checkout could not be started. Please try again."));
      return;
    }
    window.location.assign(data.url);
  };

  if (!isPremium) {
    return (
      <main className="page-content wardrobe-insights-page premium-required">
        <section className="premium-required-card">
          <span className="premium-required-lock" aria-hidden="true">🔒</span>
          <span className="eyebrow">SWATCHWELL PREMIUM</span>
          <h1>{t("Swatchwell Premium")}</h1>
          <p>{t("Understand what you wear, rediscover underused pieces and see the value of your wardrobe over time.")}</p>
          <strong>{language === "nl" ? "€2,99 per maand" : language === "fr" || language === "de" ? "2,99 € per month" : "€2.99 per month"}</strong>
          {isAuthenticated
            ? <button type="button" className="primary-button" onClick={() => void checkout()}>{t("Subscribe to Premium")} <span>→</span></button>
            : <button type="button" className="primary-button" onClick={onSignIn}>{t("Sign in")}</button>}
        </section>
      </main>
    );
  }

  if (!userId && !loading) {
    return <main className="page-content subpage wardrobe-insights-page"><section className="insights-gate"><h1>{t("Your wardrobe")} <em>{t("insights.")}</em></h1><p>{t("Sign in to view private insights for your wardrobe.")}</p><button className="primary-button" onClick={onSignIn}>{t("Sign in")}</button></section></main>;
  }

  const maxCategory = Math.max(1, ...categories.map((entry) => entry.count));

  return <main className="page-content subpage wardrobe-insights-page">
    <header className="insights-intro"><div><span className="eyebrow">SWATCHWELL PREMIUM · YOUR WARDROBE</span><h1>{t("Wardrobe")} <em>{t("insights.")}</em></h1><p>{t("A clearer picture of what you wear, what you reach for less often and the value of the pieces you own.")}</p></div><label className="insights-date-picker"><span>{t("Record wear date")}</span><input type="date" value={logDate} max={todayKey()} onChange={(event) => setLogDate(event.target.value)} /></label></header>
    {error && <p className="insights-message is-error" role="alert">{error}</p>}
    {notice && <p className="insights-message" role="status">{notice}</p>}
    {loading ? <p>{t("Loading your wardrobe insights...")}</p> : <>
      <div className="insights-stats">
        <article><span>{t("WARDROBE PIECES")}</span><strong>{wardrobe.length}</strong><small>{t("Items in your collection")}</small></article>
        <article><span>{t("RECORDED WEARS")}</span><strong>{totalWearEvents}</strong><small>{t("User-confirmed garment wears")}</small></article>
        <article><span>{t("RECORDED OUTFITS")}</span><strong>{trackedOutfits}</strong><small>{t("Days with two or more logged pieces")}</small></article>
      </div>
      <p className="insights-disclaimer">{t("Wear insights are based only on dates you record in Swatchwell. Earlier wear is not inferred, so your statistics become more useful as you add records.")}</p>
      <section className="insights-section"><div className="insights-section-heading"><div><span className="eyebrow">{t("WEAR FREQUENCY")}</span><h2>{t("Most worn pieces")}</h2></div><span>{t("Based on your records")}</span></div>
        {sortedByWear.filter((entry) => entry.wearCount > 0).slice(0, 5).length ? <div className="insights-garment-grid">{sortedByWear.filter((entry) => entry.wearCount > 0).slice(0, 5).map((entry) => <article className="insights-garment" key={entry.item.id}>{photos[entry.item.id] ? <img src={photos[entry.item.id]} alt="" /> : <span className="insights-swatch" style={{ backgroundColor: entry.item.color }} />}<div><strong>{entry.item.name}</strong><small>{translateCategory(entry.item.category, t)} · {entry.wearCount} {t("wears")}</small><small>{entry.lastWorn ? t("Last worn") + " " + dateLabel(entry.lastWorn) : t("No wear records")}</small></div></article>)}</div> : <p className="insights-empty">{t("No wear records yet. Add your first date below to start building accurate insights.")}</p>}
      </section>
      <section className="insights-section"><div className="insights-section-heading"><div><span className="eyebrow">{t("WEAR FREQUENCY")}</span><h2>{t("Least worn pieces")}</h2></div><span>{t("Sorted by recorded wear count")}</span></div>
        <div className="insights-garment-grid">{[...insights].sort((a, b) => a.wearCount - b.wearCount || (b.daysSinceWorn ?? 9999) - (a.daysSinceWorn ?? 9999)).slice(0, 5).map((entry) => <article className="insights-garment" key={entry.item.id}>{photos[entry.item.id] ? <img src={photos[entry.item.id]} alt="" /> : <span className="insights-swatch" style={{ backgroundColor: entry.item.color }} />}<div><strong>{entry.item.name}</strong><small>{translateCategory(entry.item.category, t)} · {entry.wearCount} {t("wears")}</small><small>{entry.lastWorn ? t("Last worn") + " " + dateLabel(entry.lastWorn) : t("No wear records")}</small></div></article>)}</div>
      </section>
      <section className="insights-section"><div className="insights-section-heading"><div><span className="eyebrow">{t("REDISCOVER YOUR WARDROBE")}</span><h2>{t("Underused pieces")}</h2></div><span>{underused.length} {t("pieces")}</span></div>
        <div className="insights-garment-grid">{underused.slice(0, 8).map((entry) => <article className="insights-garment insights-underused" key={entry.item.id}>{photos[entry.item.id] ? <img src={photos[entry.item.id]} alt="" /> : <span className="insights-swatch" style={{ backgroundColor: entry.item.color }} />}<div><strong>{entry.item.name}</strong><small>{translateCategory(entry.item.category, t)}</small><small>{entry.wearCount === 0 ? t("No wear records yet") : t("Not recorded in the last 30 days")}</small><button type="button" onClick={() => void logWear(entry.item.id)} disabled={busyItem === entry.item.id}>{busyItem === entry.item.id ? t("Saving...") : t("Log as worn")}</button></div></article>)}</div>
        {!underused.length && <p className="insights-empty">{t("Your recorded wear dates show that every piece has been worn recently.")}</p>}
      </section>
      <section className="insights-section"><div className="insights-section-heading"><div><span className="eyebrow">{t("COST-PER-WEAR")}</span><h2>{t("Value over time")}</h2></div></div>
        <div className="insights-cost-list">{insights.filter((entry) => entry.item.purchasePrice !== undefined && entry.item.purchasePrice >= 0).sort((a, b) => (a.costPerWear ?? Number.POSITIVE_INFINITY) - (b.costPerWear ?? Number.POSITIVE_INFINITY)).map((entry) => <article key={entry.item.id}><div><strong>{entry.item.name}</strong><small>{t("Purchase price")}: {money(entry.item.purchasePrice!)}</small></div><div><strong>{entry.costPerWear === null ? "—" : money(entry.costPerWear)}</strong><small>{entry.costPerWear === null ? t("Add wear records to calculate") : t("Cost per recorded wear")}</small></div></article>)}</div>
        <p className="insights-disclaimer">{t("Purchase prices are optional and stored privately with your wardrobe. Cost per wear uses recorded wears only.")}</p>
      </section>
      <div className="insights-two-column">
        <section className="insights-section"><div className="insights-section-heading"><div><span className="eyebrow">{t("YOUR COLLECTION")}</span><h2>{t("Category distribution")}</h2></div></div>{categories.map((entry) => <div className="insights-bar-row" key={entry.category}><span>{translateCategory(entry.category, t)}</span><div><i style={{ width: (entry.count / maxCategory * 100) + "%" }} /></div><strong>{entry.count}</strong></div>)}</section>
        <section className="insights-section"><div className="insights-section-heading"><div><span className="eyebrow">{t("COLOUR OVERVIEW")}</span><h2>{t("Colour distribution")}</h2></div></div><div className="insights-colours">{colours.slice(0, 12).map((entry) => <div key={entry.colour} title={entry.colour}><span style={{ backgroundColor: entry.colour }} /><small>{entry.colour}</small><b>{entry.count}</b></div>)}</div></section>
      </div>
      <section className="insights-section"><div className="insights-section-heading"><div><span className="eyebrow">{t("OUTFIT USAGE")}</span><h2>{t("Recorded outfit days")}</h2></div><span>{outfitUsage.length} {t("days")}</span></div>
        {outfitUsage.length ? <div className="insights-outfit-list">{outfitUsage.slice(0, 8).map((entry) => <article key={entry.date}><time>{dateLabel(entry.date)}</time><span>{entry.itemIds.map((id) => itemById.get(id)?.name).filter(Boolean).join(" · ")}</span><strong>{entry.count} {t("pieces")}</strong></article>)}</div> : <p className="insights-empty">{t("Log two or more garments on the same date to see your recorded outfit usage here.")}</p>}
      </section>
      <section className="insights-section"><div className="insights-section-heading"><div><span className="eyebrow">{t("PERSONAL RECOMMENDATIONS")}</span><h2>{t("Fresh combinations")}</h2></div><span>{t("Using your own pieces")}</span></div>
        {suggestedOutfits.length ? <div className="insights-suggestions">{suggestedOutfits.map((outfit) => <article key={outfit.id}><div>{outfit.items.map((item) => <span key={item.id}>{photos[item.id] ? <img src={photos[item.id]} alt="" /> : <i style={{ backgroundColor: item.color }} />}<small>{item.name}</small></span>)}</div><p>{outfit.underusedCount} {t("underused pieces in this combination")}</p></article>)}</div> : <p className="insights-empty">{t("Add more complete outfit pieces or wear records to receive combinations featuring underused items.")}</p>}
      </section>
      <section className="insights-section"><div className="insights-section-heading"><div><span className="eyebrow">{t("WEAR LOG")}</span><h2>{t("Correct your records")}</h2></div><button type="button" className="insights-reset" onClick={() => void resetEvents()} disabled={busyItem !== null || events.length === 0}>{t("Reset all wear data")}</button></div>
        <div className="insights-log-grid">{wardrobe.map((item) => <article key={item.id}><div><strong>{item.name}</strong><small>{translateCategory(item.category, t)}</small></div><button type="button" onClick={() => void logWear(item.id)} disabled={busyItem !== null}>{t("Log as worn")}</button></article>)}</div>
        {events.length ? <div className="insights-event-list">{events.slice(0, 40).map((event) => <article key={event.id}><time>{dateLabel(event.worn_on)}</time><span>{itemById.get(event.item_id)?.name ?? t("Removed wardrobe item")}</span><button type="button" onClick={() => void deleteEvent(event)} disabled={busyItem === event.id}>{t("Remove")}</button></article>)}</div> : <p className="insights-empty">{t("No wear records have been added yet.")}</p>}
      </section>
    </>}
  </main>;
}
