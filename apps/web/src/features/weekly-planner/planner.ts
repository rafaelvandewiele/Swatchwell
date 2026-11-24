import type { ClothingItem } from "@swatchwell/shared";
import type { ColorSeason } from "@swatchwell/color-engine";
import { generateOutfits, type OutfitRecommendation } from "@swatchwell/outfit-engine";

export const PLANNER_OCCASIONS = [
  "Everyday",
  "School / work",
  "Smart casual",
  "Formal",
  "Sport",
] as const;

export type PlannerOccasion = (typeof PLANNER_OCCASIONS)[number];

export const PLANNER_WEATHER = ["Any weather", "Warm", "Mild", "Cold"] as const;
export type PlannerWeather = (typeof PLANNER_WEATHER)[number];

export interface PlannedDay {
  date: string;
  occasion: PlannerOccasion;
  weather: PlannerWeather;
  pinned: boolean;
  itemIds: string[] | null;
  wornAt: string | null;
}

export interface WeeklyPlan {
  weekStart: string;
  days: PlannedDay[];
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function toLocalDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

export function getMonday(value: Date): Date {
  const date = new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12);
  const weekday = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - weekday);
  return date;
}

export function getWeekStartKey(value: Date): string {
  return toLocalDateKey(getMonday(value));
}

export function getWeekDates(weekStart: string): string[] {
  const monday = parseLocalDate(weekStart);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return toLocalDateKey(date);
  });
}

export function createEmptyWeeklyPlan(weekStart: string): WeeklyPlan {
  return {
    weekStart,
    days: getWeekDates(weekStart).map((date) => ({
      date,
      occasion: "Everyday",
      weather: "Any weather",
      pinned: false,
      itemIds: null,
      wornAt: null,
    })),
  };
}

export function isPlannerWeather(value: unknown): value is PlannerWeather {
  return typeof value === "string" && (PLANNER_WEATHER as readonly string[]).includes(value);
}

export function isPlannerOccasion(value: unknown): value is PlannerOccasion {
  return typeof value === "string" && (PLANNER_OCCASIONS as readonly string[]).includes(value);
}

export function normalizeWeeklyPlan(weekStart: string, value: unknown): WeeklyPlan {
  const empty = createEmptyWeeklyPlan(weekStart);
  if (!Array.isArray(value)) return empty;
  const byDate = new Map(value.filter((entry): entry is Record<string, unknown> =>
    Boolean(entry) && typeof entry === "object" && !Array.isArray(entry),
  ).map((entry) => [String(entry.date ?? ""), entry]));

  return {
    weekStart,
    days: empty.days.map((day) => {
      const entry = byDate.get(day.date);
      if (!entry) return day;
      return {
        date: day.date,
        occasion: isPlannerOccasion(entry.occasion) ? entry.occasion : "Everyday",
        weather: isPlannerWeather(entry.weather) ? entry.weather : "Any weather",
        pinned: entry.pinned === true,
        itemIds: (() => {
          const ids = Array.isArray(entry.item_ids)
            ? entry.item_ids.filter((id): id is string => typeof id === "string")
            : Array.isArray(entry.itemIds)
              ? entry.itemIds.filter((id): id is string => typeof id === "string")
              : [];
          return ids.length ? ids : null;
        })(),
        wornAt: typeof entry.worn_at === "string" ? entry.worn_at : typeof entry.wornAt === "string" ? entry.wornAt : null,
      };
    }),
  };
}


export function getOccasionFit(outfit: OutfitRecommendation, occasion: PlannerOccasion): number {
  if (occasion === "Everyday") return 0;
  return outfit.items.reduce((score, item) => {
    const text = item.name.toLowerCase();
    const sporty = /sport|running|run\b|training|gym|athletic|track|performance/.test(text);
    const formal = /formal|suit|blazer|oxford|dress|loafer|derby|smart/.test(text);
    let value = 0;

    if (occasion === "Sport") {
      if (item.category === "tshirt" || item.category === "shoes" || item.category === "accessory") value += 1;
      if (item.category === "shirt" || item.category === "polo") value -= 1.5;
      if (sporty) value += 2;
      if (formal) value -= 2;
    } else if (occasion === "Formal") {
      if (item.category === "shirt" || item.category === "pants" || item.category === "jacket") value += 1;
      if (item.category === "tshirt") value -= 2;
      if (formal) value += 2;
      if (sporty) value -= 2;
    } else if (occasion === "Smart casual") {
      if (item.category === "shirt" || item.category === "polo" || item.category === "sweater" || item.category === "pants") value += 1;
      if (item.category === "tshirt") value -= 0.5;
      if (formal) value += 1;
      if (sporty) value -= 1;
    } else if (occasion === "School / work") {
      if (item.category === "shirt" || item.category === "polo" || item.category === "sweater" || item.category === "pants") value += 1;
      if (item.category === "tshirt") value -= 0.75;
      if (formal) value += 0.5;
      if (sporty) value -= 1;
    }
    return score + value;
  }, 0);
}

export function getWeatherFit(outfit: OutfitRecommendation, weather: PlannerWeather): number {
  if (weather === "Any weather" || weather === "Mild") return 0;
  const hasLayer = outfit.items.some((item) => item.category === "sweater" || item.category === "jacket");
  if (weather === "Cold") return hasLayer ? 2 : -1;
  return hasLayer ? -2 : 1;
}

function isCompleteLayeredOutfit(items: ClothingItem[]): boolean {
  const categories = new Set(items.map((item) => item.category));
  const hasBaseTop = ["shirt", "tshirt", "polo"].some((category) => categories.has(category as ClothingItem["category"]));
  return hasBaseTop && categories.has("pants");
}

function getOutfitCoreKey(items: OutfitRecommendation["items"]): string {
  return items
    .filter((item) => ["sweater", "shirt", "tshirt", "polo", "pants"].includes(item.category))
    .map((item) => item.id)
    .sort()
    .join("-");
}

function selectCandidate(
  pool: OutfitRecommendation[],
  usage: Map<string, number>,
  day: PlannedDay,
): OutfitRecommendation | undefined {
  return [...pool].sort((first, second) => {
    const value = (candidate: OutfitRecommendation) =>
      candidate.score
      + getOccasionFit(candidate, day.occasion) * 5
      + getWeatherFit(candidate, day.weather) * 4
      - candidate.items.reduce((sum, item) => sum + (usage.get(item.id) ?? 0) * 5, 0);
    return value(second) - value(first) || first.id.localeCompare(second.id);
  })[0];
}

export function generateWeeklyOutfits(
  wardrobe: ClothingItem[],
  season: ColorSeason | undefined,
  currentDays: PlannedDay[],
  recentHistory: PlannedDay[] = [],
): { days: PlannedDay[]; candidates: OutfitRecommendation[]; repeatConflicts: string[] } {
  const rawCandidates = generateOutfits(wardrobe, {
    limit: 50,
    requireCompleteLayers: true,
    ...(season ? { season } : {}),
  });
  // A different pair of shoes does not make an otherwise identical outfit new.
  const seenCoreOutfits = new Set<string>();
  const candidates = rawCandidates.filter((outfit) => {
    const key = getOutfitCoreKey(outfit.items);
    if (!key || seenCoreOutfits.has(key)) return false;
    seenCoreOutfits.add(key);
    return true;
  });
  const availableIds = new Set(wardrobe.map((item) => item.id));
  const validCandidates = candidates.filter((outfit) =>
    outfit.items.some((item) => ["shirt", "tshirt", "polo"].includes(item.category)) &&
    outfit.items.some((item) => item.category === "pants") &&
    outfit.items.every((item) => availableIds.has(item.id)),
  );
  const usage = new Map<string, number>();
  const usedOutfits = new Set<string>();
  const recentOutfits = new Set<string>();
  for (const historicalDay of recentHistory) {
    if (!historicalDay.itemIds?.length) continue;
    const key = getOutfitCoreKey(historicalDay.itemIds.map((id) => wardrobe.find((item) => item.id === id)).filter((item): item is ClothingItem => Boolean(item)));
    recentOutfits.add(key);
    historicalDay.itemIds.forEach((id) => usage.set(id, (usage.get(id) ?? 0) + 1));
  }
  const repeatConflicts: string[] = [];

  const days = currentDays.map((day) => ({ ...day, itemIds: day.itemIds ? [...day.itemIds] : null }));

  // Pinned days are reserved first so generating the rest never replaces them.
  for (const day of days) {
    if ((!day.pinned && !day.wornAt) || !day.itemIds) continue;
    const id = getOutfitCoreKey(day.itemIds.map((itemId) => wardrobe.find((item) => item.id === itemId)).filter((item): item is ClothingItem => Boolean(item)));
    const ownedIds = new Set(wardrobe.map((item) => item.id));
    const pinnedItems = day.itemIds.map((itemId) => wardrobe.find((item) => item.id === itemId)).filter((item): item is ClothingItem => Boolean(item));
    if (!day.itemIds.every((itemId) => ownedIds.has(itemId)) || !isCompleteLayeredOutfit(pinnedItems)) {
      day.pinned = false;
      day.wornAt = null;
      day.itemIds = null;
      continue;
    }
    usedOutfits.add(id);
    day.itemIds.forEach((itemId) => usage.set(itemId, (usage.get(itemId) ?? 0) + 1));
  }

  for (const day of days) {
    if ((day.pinned || day.wornAt) && day.itemIds) continue;

    const unassigned = validCandidates.filter((candidate) => !usedOutfits.has(getOutfitCoreKey(candidate.items)));
    const noRecentRepeat = unassigned.filter((candidate) => !recentOutfits.has(getOutfitCoreKey(candidate.items)));
    const pool = noRecentRepeat;
    if (pool.length === 0) {
      day.itemIds = null;
      continue;
    }

    const selected = selectCandidate(pool, usage, day);
    if (!selected) {
      day.itemIds = null;
      continue;
    }

    day.itemIds = selected.items.map((item) => item.id);
    day.wornAt = null;
    const selectedCoreKey = getOutfitCoreKey(selected.items);
    if (recentOutfits.has(selectedCoreKey) || usedOutfits.has(selectedCoreKey)) repeatConflicts.push(day.date);
    usedOutfits.add(selectedCoreKey);
    selected.items.forEach((item) => usage.set(item.id, (usage.get(item.id) ?? 0) + 1));
  }

  return { days, candidates, repeatConflicts };
}

export function sanitizeWeeklyPlanForWardrobe(plan: WeeklyPlan, ownedItemIds: Set<string>, wardrobe: ClothingItem[] = []): WeeklyPlan {
  const wardrobeById = new Map(wardrobe.map((item) => [item.id, item]));
  return {
    ...plan,
    days: plan.days.map((day) => {
      if (!day.itemIds?.length) return day;
      const items = day.itemIds.map((id) => wardrobeById.get(id));
      const complete = wardrobe.length === 0 || (items.every((item): item is ClothingItem => Boolean(item)) && isCompleteLayeredOutfit(items as ClothingItem[]));
      return day.itemIds.every((id) => ownedItemIds.has(id)) && complete
        ? day
        : { ...day, itemIds: null, pinned: false, wornAt: null };
    }),
  };
}

export function getOutfitForDay(
  day: PlannedDay,
  wardrobe: ClothingItem[],
): ClothingItem[] {
  if (!day.itemIds?.length) return [];
  const byId = new Map(wardrobe.map((item) => [item.id, item]));
  const items = day.itemIds.map((id) => byId.get(id));
  return items.every((item): item is ClothingItem => Boolean(item)) ? items : [];
}

export function regenerateDayOutfit(
  wardrobe: ClothingItem[],
  season: ColorSeason | undefined,
  currentDays: PlannedDay[],
  targetIndex: number,
  recentHistory: PlannedDay[] = [],
): { days: PlannedDay[]; candidates: OutfitRecommendation[]; repeatConflict: boolean } {
  if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= currentDays.length) {
    throw new RangeError("The target day is outside the weekly plan.");
  }
  if (currentDays[targetIndex].wornAt) {
    return { days: currentDays.map((day) => ({ ...day, itemIds: day.itemIds ? [...day.itemIds] : null })), candidates: [], repeatConflict: false };
  }
  const rawCandidates = generateOutfits(wardrobe, {
    limit: 50,
    requireCompleteLayers: true,
    ...(season ? { season } : {}),
  });
  const seenCoreOutfits = new Set<string>();
  const candidates = rawCandidates.filter((outfit) => {
    const key = getOutfitCoreKey(outfit.items);
    if (!key || seenCoreOutfits.has(key)) return false;
    seenCoreOutfits.add(key);
    return true;
  });
  const reserved = new Set<string>();
  const usage = new Map<string, number>();
  const recentOutfits = new Set(recentHistory.filter((day) => day.itemIds?.length).map((day) => getOutfitCoreKey(day.itemIds!.map((id) => wardrobe.find((item) => item.id === id)).filter((item): item is ClothingItem => Boolean(item)))));
  recentHistory.forEach((day) => day.itemIds?.forEach((id) => usage.set(id, (usage.get(id) ?? 0) + 1)));

  currentDays.forEach((day, index) => {
    if (index === targetIndex || !day.itemIds?.length) return;
    reserved.add(getOutfitCoreKey(day.itemIds.map((id) => wardrobe.find((item) => item.id === id)).filter((item): item is ClothingItem => Boolean(item))));
    day.itemIds.forEach((id) => usage.set(id, (usage.get(id) ?? 0) + 1));
  });

  const available = candidates.filter((candidate) => !reserved.has(getOutfitCoreKey(candidate.items)));
  const currentItems = currentDays[targetIndex].itemIds?.map((id) => wardrobe.find((item) => item.id === id)).filter((item): item is ClothingItem => Boolean(item)) ?? [];
  const currentCoreKey = currentItems.length ? getOutfitCoreKey(currentItems) : null;
  const pool = available.filter((candidate) => {
    const coreKey = getOutfitCoreKey(candidate.items);
    return coreKey !== currentCoreKey && !recentOutfits.has(coreKey);
  });
  const selected = selectCandidate(pool, usage, currentDays[targetIndex]);

  const days = currentDays.map((day, index) => index === targetIndex
    ? selected
      ? { ...day, itemIds: selected.items.map((item) => item.id), pinned: false, wornAt: null }
      : { ...day, itemIds: day.itemIds ? [...day.itemIds] : null }
    : { ...day, itemIds: day.itemIds ? [...day.itemIds] : null });
  return { days, candidates, repeatConflict: !selected };
}

export function canAccessPremiumPlanner(isAuthenticated: boolean, isPremium: boolean): boolean {
  return isAuthenticated && isPremium;
}

export function assignOutfitToDay(days: PlannedDay[], index: number, itemIds: string[]): PlannedDay[] {
  if (!Number.isInteger(index) || index < 0 || index >= days.length) {
    throw new RangeError("The target day is outside the weekly plan.");
  }
  if (itemIds.length < 2 || new Set(itemIds).size !== itemIds.length) {
    throw new RangeError("A complete outfit must contain at least two distinct wardrobe items.");
  }
  return days.map((day, dayIndex) => dayIndex === index
    ? { ...day, itemIds: [...itemIds], pinned: false, wornAt: null }
    : { ...day, itemIds: day.itemIds ? [...day.itemIds] : null });
}
