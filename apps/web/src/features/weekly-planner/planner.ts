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
  const candidates = generateOutfits(wardrobe, {
    limit: 50,
    ...(season ? { season } : {}),
  });
  const availableIds = new Set(wardrobe.map((item) => item.id));
  const validCandidates = candidates.filter((outfit) =>
    outfit.items.length >= 2 && outfit.items.every((item) => availableIds.has(item.id)),
  );
  const usage = new Map<string, number>();
  const usedOutfits = new Set<string>();
  const recentOutfits = new Set<string>();
  for (const historicalDay of recentHistory) {
    if (!historicalDay.itemIds?.length) continue;
    const key = [...historicalDay.itemIds].sort().join("-");
    recentOutfits.add(key);
    historicalDay.itemIds.forEach((id) => usage.set(id, (usage.get(id) ?? 0) + 1));
  }
  const repeatConflicts: string[] = [];

  const days = currentDays.map((day) => ({ ...day, itemIds: day.itemIds ? [...day.itemIds] : null }));

  // Pinned days are reserved first so generating the rest never replaces them.
  for (const day of days) {
    if ((!day.pinned && !day.wornAt) || !day.itemIds) continue;
    const id = [...day.itemIds].sort().join("-");
    const ownedIds = new Set(wardrobe.map((item) => item.id));
    if (!day.itemIds.every((itemId) => ownedIds.has(itemId))) {
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

    const unassigned = validCandidates.filter((candidate) => !usedOutfits.has(candidate.id));
    const noRecentRepeat = unassigned.filter((candidate) => !recentOutfits.has(candidate.id));
    const pool = noRecentRepeat.length > 0 ? noRecentRepeat : unassigned.length > 0 ? unassigned : validCandidates;
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
    if (recentOutfits.has(selected.id) || usedOutfits.has(selected.id)) repeatConflicts.push(day.date);
    usedOutfits.add(selected.id);
    selected.items.forEach((item) => usage.set(item.id, (usage.get(item.id) ?? 0) + 1));
  }

  return { days, candidates, repeatConflicts };
}

export function sanitizeWeeklyPlanForWardrobe(plan: WeeklyPlan, ownedItemIds: Set<string>): WeeklyPlan {
  return {
    ...plan,
    days: plan.days.map((day) => day.itemIds?.length && day.itemIds.every((id) => ownedItemIds.has(id))
      ? day
      : day.itemIds ? { ...day, itemIds: null, pinned: false, wornAt: null } : day),
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
  const candidates = generateOutfits(wardrobe, {
    limit: 50,
    ...(season ? { season } : {}),
  });
  const reserved = new Set<string>();
  const usage = new Map<string, number>();
  const recentOutfits = new Set(recentHistory.filter((day) => day.itemIds?.length).map((day) => [...day.itemIds!].sort().join("-")));
  recentHistory.forEach((day) => day.itemIds?.forEach((id) => usage.set(id, (usage.get(id) ?? 0) + 1)));

  currentDays.forEach((day, index) => {
    if (index === targetIndex || !day.itemIds?.length) return;
    reserved.add([...day.itemIds].sort().join("-"));
    day.itemIds.forEach((id) => usage.set(id, (usage.get(id) ?? 0) + 1));
  });

  const available = candidates.filter((candidate) => !reserved.has(candidate.id));
  const nonRecent = available.filter((candidate) => !recentOutfits.has(candidate.id));
  const pool = nonRecent.length > 0 ? nonRecent : available.length > 0 ? available : candidates;
  const selected = selectCandidate(pool, usage, currentDays[targetIndex]);

  const days = currentDays.map((day, index) => index === targetIndex
    ? { ...day, itemIds: selected ? selected.items.map((item) => item.id) : null, pinned: false, wornAt: null }
    : { ...day, itemIds: day.itemIds ? [...day.itemIds] : null });
  return { days, candidates, repeatConflict: Boolean(selected && recentOutfits.has(selected.id)) };
}

export function canAccessPremiumPlanner(isAuthenticated: boolean, isPremium: boolean): boolean {
  return isAuthenticated && isPremium;
}
