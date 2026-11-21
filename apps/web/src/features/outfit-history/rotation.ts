export type GarmentStatus = "available" | "laundry" | "unavailable" | "repair";
export interface GarmentStatusRecord { item_id: string; status: GarmentStatus; updated_at?: string }
export interface OutfitWearRecord { id: string; item_ids: string[]; outfit_name?: string | null; worn_on: string; created_at?: string }
export function isGarmentAvailable(status: GarmentStatus | undefined, includeUnavailable = false): boolean {
  return includeUnavailable || !status || status === "available";
}
export function outfitSignature(itemIds: string[]): string {
  return [...new Set(itemIds)].sort().join("|");
}
export function isWithinRepeatWindow(wornOn: string, candidateDate: string, days: number): boolean {
  if (days <= 0) return false;
  const worn = new Date(wornOn + "T12:00:00");
  const candidate = new Date(candidateDate + "T12:00:00");
  const difference = Math.abs(candidate.getTime() - worn.getTime()) / 86400000;
  return difference < days;
}
export function filterRecentOutfits<T extends { item_ids: string[]; worn_on: string }>(outfits: T[], candidateDate: string, days: number): T[] {
  return outfits.filter((entry) => isWithinRepeatWindow(entry.worn_on, candidateDate, days));
}
export function sortWearHistory<T extends { worn_on: string; created_at?: string }>(records: T[]): T[] {
  return [...records].sort((a,b) => b.worn_on.localeCompare(a.worn_on) || (b.created_at ?? "").localeCompare(a.created_at ?? ""));
}
