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

export interface PlannedDay {
  date: string;
  occasion: PlannerOccasion;
  pinned: boolean;
  itemIds: string[] | null;
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
      pinned: false,
      itemIds: null,
    })),
  };
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
        pinned: entry.pinned === true,
        itemIds: Array.isArray(entry.item_ids)
          ? entry.item_ids.filter((id): id is string => typeof id === "string")
          : Array.isArray(entry.itemIds)
            ? entry.itemIds.filter((id): id is string => typeof id === "string")
            : null,
      };
    }),
  };
}

export function generateWeeklyOutfits(
  wardrobe: ClothingItem[],
  season: ColorSeason | undefined,
  currentDays: PlannedDay[],
): { days: PlannedDay[]; candidates: OutfitRecommendation[] } {
  const candidates = generateOutfits(wardrobe, {
    limit: 50,
    ...(season ? { season } : {}),
  });
  const availableIds = new Set(wardrobe.map((item) => item.id));
  const validCandidates = candidates.filter((outfit) =>
    outfit.items.length >= 2 && outfit.items.every((item) => availableIds.has(item.id)),
  );
  const candidateById = new Map(validCandidates.map((outfit) => [outfit.id, outfit]));
  const usage = new Map<string, number>();
  const usedOutfits = new Set<string>();

  const days = currentDays.map((day) => ({ ...day, itemIds: day.itemIds ? [...day.itemIds] : null }));

  // Pinned days are reserved first so generating the rest never replaces them.
  for (const day of days) {
    if (!day.pinned || !day.itemIds) continue;
    const id = [...day.itemIds].sort().join("-");
    const pinned = candidateById.get(id);
    if (!pinned) {
      day.pinned = false;
      day.itemIds = null;
      continue;
    }
    usedOutfits.add(pinned.id);
    pinned.items.forEach((item) => usage.set(item.id, (usage.get(item.id) ?? 0) + 1));
  }

  for (const day of days) {
    if (day.pinned && day.itemIds) continue;

    const unassigned = validCandidates.filter((candidate) => !usedOutfits.has(candidate.id));
    const pool = unassigned.length > 0 ? unassigned : validCandidates;
    if (pool.length === 0) {
      day.itemIds = null;
      continue;
    }

    const selected = [...pool].sort((first, second) => {
      const cost = (candidate: OutfitRecommendation) => {
        const reuse = candidate.items.reduce((sum, item) => sum + (usage.get(item.id) ?? 0), 0);
        return candidate.score - reuse * 5;
      };
      return cost(second) - cost(first) || first.id.localeCompare(second.id);
    })[0];

    day.itemIds = selected.items.map((item) => item.id);
    usedOutfits.add(selected.id);
    selected.items.forEach((item) => usage.set(item.id, (usage.get(item.id) ?? 0) + 1));
  }

  return { days, candidates };
}

export function getOutfitForDay(
  day: PlannedDay,
  candidates: OutfitRecommendation[],
): OutfitRecommendation | null {
  if (!day.itemIds?.length) return null;
  const wanted = [...day.itemIds].sort().join("-");
  return candidates.find((candidate) => [...candidate.items.map((item) => item.id)].sort().join("-") === wanted) ?? null;
}

export function regenerateDayOutfit(
  wardrobe: ClothingItem[],
  season: ColorSeason | undefined,
  currentDays: PlannedDay[],
  targetIndex: number,
): { days: PlannedDay[]; candidates: OutfitRecommendation[] } {
  if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= currentDays.length) {
    throw new RangeError("The target day is outside the weekly plan.");
  }
  const candidates = generateOutfits(wardrobe, {
    limit: 50,
    ...(season ? { season } : {}),
  });
  const reserved = new Set<string>();
  const usage = new Map<string, number>();

  currentDays.forEach((day, index) => {
    if (index === targetIndex || !day.itemIds?.length) return;
    reserved.add([...day.itemIds].sort().join("-"));
    day.itemIds.forEach((id) => usage.set(id, (usage.get(id) ?? 0) + 1));
  });

  const available = candidates.filter((candidate) => !reserved.has(candidate.id));
  const pool = available.length > 0 ? available : candidates;
  const selected = [...pool].sort((first, second) => {
    const value = (candidate: OutfitRecommendation) =>
      candidate.score - candidate.items.reduce((sum, item) => sum + (usage.get(item.id) ?? 0) * 5, 0);
    return value(second) - value(first) || first.id.localeCompare(second.id);
  })[0];

  const days = currentDays.map((day, index) => index === targetIndex
    ? { ...day, itemIds: selected ? selected.items.map((item) => item.id) : null, pinned: false }
    : { ...day, itemIds: day.itemIds ? [...day.itemIds] : null });
  return { days, candidates };
}
