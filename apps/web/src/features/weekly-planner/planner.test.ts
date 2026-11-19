import { describe, expect, it } from "vitest";
import {
  createEmptyWeeklyPlan,
  generateWeeklyOutfits,
  getMonday,
  getWeekDates,
  getWeekStartKey,
  normalizeWeeklyPlan,
  regenerateDayOutfit,
  parseLocalDate,
  toLocalDateKey,
} from "./planner";

describe("weekly planner date helpers", () => {
  it("uses Monday as the start of the week", () => {
    expect(getWeekStartKey(new Date(2026, 10, 19, 18))).toBe("2026-11-16");
    expect(toLocalDateKey(getMonday(new Date(2026, 10, 22)))).toBe("2026-11-16");
  });

  it("creates seven consecutive local calendar dates", () => {
    expect(getWeekDates("2026-11-16")).toEqual([
      "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19",
      "2026-11-20", "2026-11-21", "2026-11-22",
    ]);
    expect(toLocalDateKey(parseLocalDate("2026-11-16"))).toBe("2026-11-16");
  });

  it("normalizes incomplete or malformed saved plans safely", () => {
    const plan = normalizeWeeklyPlan("2026-11-16", [
      { date: "2026-11-17", occasion: "Formal", pinned: true, item_ids: ["a", 4] },
      { date: "2026-11-18", occasion: "unknown", pinned: "yes", item_ids: null },
    ]);
    expect(plan.days).toHaveLength(7);
    expect(plan.days[1]).toEqual({
      date: "2026-11-17", occasion: "Formal", pinned: true, itemIds: ["a"],
    });
    expect(plan.days[2].occasion).toBe("Everyday");
    expect(plan.days[2].pinned).toBe(false);
    expect(createEmptyWeeklyPlan("2026-11-16").days.every((day) => !day.itemIds)).toBe(true);
  });
});

describe("weekly outfit selection", () => {
  const wardrobe = [
    { id: "shirt-1", name: "Oxford shirt", category: "shirt" as const, color: "#FFFFFF" },
    { id: "shirt-2", name: "Blue shirt", category: "shirt" as const, color: "#263B55" },
    { id: "tee-1", name: "White tee", category: "tshirt" as const, color: "#F5F2EA" },
    { id: "pants-1", name: "Chinos", category: "pants" as const, color: "#C8BDAA" },
    { id: "pants-2", name: "Dark trousers", category: "pants" as const, color: "#252525" },
    { id: "pants-3", name: "Olive trousers", category: "pants" as const, color: "#355444" },
    { id: "shoes-1", name: "Sneakers", category: "shoes" as const, color: "#FFFFFF" },
  ];

  it("creates complete outfits, avoids exact repeats when enough combinations exist and preserves pinned days", () => {
    const days = createEmptyWeeklyPlan("2026-11-16").days;
    days[0].pinned = true;
    days[0].itemIds = ["shirt-1", "pants-1", "shoes-1"];
    const result = generateWeeklyOutfits(wardrobe, undefined, days);
    expect(result.days).toHaveLength(7);
    expect(result.days[0].pinned).toBe(true);
    expect(result.days[0].itemIds).toEqual(["shirt-1", "pants-1", "shoes-1"]);
    const assigned = result.days.map((day) => day.itemIds?.slice().sort().join("-")).filter(Boolean);
    expect(new Set(assigned).size).toBe(assigned.length);
    for (const day of result.days) {
      if (day.itemIds) {
        expect(day.itemIds).toContain(day.itemIds.find((id) => id.startsWith("shirt") || id.startsWith("tee"))!);
        expect(day.itemIds.some((id) => id.startsWith("pants"))).toBe(true);
      }
    }
  });

  it("refreshes one day without changing the other assigned outfits", () => {
    const days = createEmptyWeeklyPlan("2026-11-16").days;
    const first = generateWeeklyOutfits(wardrobe, undefined, days).days;
    const before = first.filter((_, index) => index !== 3).map((day) => day.itemIds);
    const refreshed = regenerateDayOutfit(wardrobe, undefined, first, 3).days;
    expect(refreshed.filter((_, index) => index !== 3).map((day) => day.itemIds)).toEqual(before);
    const otherIds = new Set(refreshed.filter((_, index) => index !== 3).map((day) => day.itemIds?.slice().sort().join("-")));
    expect(otherIds.has(refreshed[3].itemIds?.slice().sort().join("-") ?? "")).toBe(false);
  });

  it("uses the selected day context when ranking available outfits", () => {
    const days = createEmptyWeeklyPlan("2026-11-16").days;
    days[0].occasion = "Formal";
    const formal = generateWeeklyOutfits(wardrobe, undefined, days).days[0];
    expect(formal.itemIds).not.toBeNull();
    const sportDays = createEmptyWeeklyPlan("2026-11-16").days;
    sportDays[0].occasion = "Sport";
    const sport = generateWeeklyOutfits(wardrobe, undefined, sportDays).days[0];
    expect(sport.itemIds).not.toBeNull();
  });

  it("returns unassigned days when the wardrobe cannot form any outfit", () => {
    const result = generateWeeklyOutfits(
      [{ id: "shirt", name: "Shirt", category: "shirt", color: "#FFFFFF" }],
      undefined,
      createEmptyWeeklyPlan("2026-11-16").days,
    );
    expect(result.days.every((day) => day.itemIds === null)).toBe(true);
  });
});
