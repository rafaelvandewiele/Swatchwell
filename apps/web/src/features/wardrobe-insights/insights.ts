export interface InsightGarment {
  id: string;
  name: string;
  category: string;
  color: string;
  purchasePrice?: number;
}

export interface GarmentWearEvent {
  id: string;
  item_id: string;
  worn_on: string;
}

export interface GarmentInsight {
  item: InsightGarment;
  wearCount: number;
  lastWorn: string | null;
  costPerWear: number | null;
  daysSinceWorn: number | null;
}

export interface OutfitUsage {
  date: string;
  itemIds: string[];
  count: number;
}

export function calculateCostPerWear(
  purchasePrice: number | undefined,
  wearCount: number,
): number | null {
  if (purchasePrice === undefined || !Number.isFinite(purchasePrice) || purchasePrice < 0 || wearCount <= 0) return null;
  return purchasePrice / wearCount;
}

export function buildGarmentInsights(
  wardrobe: InsightGarment[],
  events: GarmentWearEvent[],
  now = new Date(),
): GarmentInsight[] {
  const eventMap = new Map<string, string[]>();
  for (const event of events) {
    const dates = eventMap.get(event.item_id) ?? [];
    dates.push(event.worn_on);
    eventMap.set(event.item_id, dates);
  }

  return wardrobe.map((item) => {
    const dates = (eventMap.get(item.id) ?? []).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)).sort();
    const lastWorn = dates.at(-1) ?? null;
    const daysSinceWorn = lastWorn
      ? Math.max(0, Math.floor((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.parse(lastWorn + "T00:00:00Z")) / 86_400_000))
      : null;
    return {
      item,
      wearCount: dates.length,
      lastWorn,
      costPerWear: calculateCostPerWear(item.purchasePrice, dates.length),
      daysSinceWorn,
    };
  });
}

export function buildOutfitUsage(events: GarmentWearEvent[]): OutfitUsage[] {
  const byDate = new Map<string, Set<string>>();
  for (const event of events) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(event.worn_on)) continue;
    const ids = byDate.get(event.worn_on) ?? new Set<string>();
    ids.add(event.item_id);
    byDate.set(event.worn_on, ids);
  }
  return [...byDate.entries()]
    .map(([date, ids]) => ({ date, itemIds: [...ids].sort(), count: ids.size }))
    .filter((entry) => entry.count >= 2)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function getCategoryDistribution(wardrobe: InsightGarment[]) {
  const counts = new Map<string, number>();
  for (const item of wardrobe) counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
  return [...counts.entries()].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
}

export function getColourDistribution(wardrobe: InsightGarment[]) {
  const counts = new Map<string, number>();
  for (const item of wardrobe) {
    for (const colour of [item.color, ...((item as InsightGarment & { extraColors?: string[] }).extraColors ?? [])]) {
      const key = colour.toUpperCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()].map(([colour, count]) => ({ colour, count })).sort((a, b) => b.count - a.count || a.colour.localeCompare(b.colour));
}
