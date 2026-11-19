import { describe, expect, it } from "vitest";
import {
  createEmptyWeeklyPlan,
  generateWeeklyOutfits,
  getOutfitForDay,
  getMonday,
  getWeekDates,
  getWeekStartKey,
  getOccasionFit,
  getWeatherFit,
  normalizeWeeklyPlan,
  regenerateDayOutfit,
  sanitizeWeeklyPlanForWardrobe,
  canAccessPremiumPlanner,
  assignOutfitToDay,
  parseLocalDate,
  toLocalDateKey,
} from "./planner";

describe("weekly planner entitlement", () => {
  it("requires both a signed-in account and Premium entitlement", () => {
    expect(canAccessPremiumPlanner(false, true)).toBe(false);
    expect(canAccessPremiumPlanner(true, false)).toBe(false);
    expect(canAccessPremiumPlanner(true, true)).toBe(true);
  });
});

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
      { date: "2026-11-17", occasion: "Formal", weather: "Cold", pinned: true, item_ids: ["a", 4] },
      { date: "2026-11-18", occasion: "unknown", pinned: "yes", item_ids: null },
    ]);
    expect(plan.days).toHaveLength(7);
    expect(plan.days[1]).toEqual({
      date: "2026-11-17", occasion: "Formal", weather: "Cold", pinned: true, itemIds: ["a"], wornAt: null,
    });
    expect(plan.days[2].occasion).toBe("Everyday");
    expect(plan.days[2].pinned).toBe(false);
    expect(plan.days[2].wornAt).toBeNull();
    expect(plan.days[0].weather).toBe("Any weather");
    expect(plan.days[1].weather).toBe("Cold");
    expect(createEmptyWeeklyPlan("2026-11-16").days.every((day) => !day.itemIds)).toBe(true);
  });
});

describe("weekly outfit selection", () => {
  const wardrobe = [
    { id: "shirt-1", name: "Oxford shirt", category: "shirt" as const, color: "#FFFFFF" },
    { id: "shirt-2", name: "Blue shirt", category: "shirt" as const, color: "#263B55" },
    { id: "tee-1", name: "White tee", category: "tshirt" as const, color: "#F5F2EA" },
    { id: "tee-2", name: "Navy tee", category: "tshirt" as const, color: "#263B55" },
    { id: "sweater-1", name: "Grey sweater", category: "sweater" as const, color: "#888888" },
    { id: "sweater-2", name: "Navy sweater", category: "sweater" as const, color: "#263B55" },
    { id: "pants-1", name: "Chinos", category: "pants" as const, color: "#C8BDAA" },
    { id: "pants-2", name: "Dark trousers", category: "pants" as const, color: "#252525" },
    { id: "pants-3", name: "Olive trousers", category: "pants" as const, color: "#355444" },
    { id: "shoes-1", name: "Sneakers", category: "shoes" as const, color: "#FFFFFF" },
    { id: "shoes-2", name: "Brown shoes", category: "shoes" as const, color: "#684B35" },
  ];

  it("creates complete outfits, avoids exact repeats when enough combinations exist and preserves pinned days", () => {
    const days = createEmptyWeeklyPlan("2026-11-16").days;
    days[0].pinned = true;
    days[0].itemIds = ["tee-1", "sweater-1", "pants-1", "shoes-1"];
    const result = generateWeeklyOutfits(wardrobe, undefined, days);
    expect(result.days).toHaveLength(7);
    expect(result.days[0].pinned).toBe(true);
    expect(result.days[0].itemIds).toEqual(["tee-1", "sweater-1", "pants-1", "shoes-1"]);
    const assigned = result.days.map((day) => day.itemIds?.slice().sort().join("-")).filter(Boolean);
    expect(new Set(assigned).size).toBe(assigned.length);
    const coreLooks = result.days.map((day) => day.itemIds?.filter((id) => !id.startsWith("shoes-")).sort().join("-")).filter(Boolean);
    expect(new Set(coreLooks).size).toBe(coreLooks.length);
    for (const day of result.days) {
      if (day.itemIds) {
        expect(day.itemIds.some((id) => id.startsWith("tee-"))).toBe(true);
        expect(day.itemIds.some((id) => id.startsWith("sweater-"))).toBe(true);
        expect(day.itemIds.some((id) => id.startsWith("pants-"))).toBe(true);
        expect(day.itemIds.some((id) => id.startsWith("shoes-"))).toBe(true);
      }
    }
  });

  it("clears saved outfit references that do not belong to the signed-in user's wardrobe", () => {
    const plan = createEmptyWeeklyPlan("2026-11-16");
    plan.days[0].itemIds = ["shirt-1", "pants-1"];
    plan.days[0].pinned = true;
    const sanitized = sanitizeWeeklyPlanForWardrobe(plan, new Set(["shirt-1"]));
    expect(sanitized.days[0].itemIds).toBeNull();
    expect(sanitized.days[0].pinned).toBe(false);
  });

  it("preserves outfits already marked as worn when regenerating the week", () => {
    const days = createEmptyWeeklyPlan("2026-11-16").days;
    days[0].itemIds = ["tee-1", "sweater-1", "pants-1", "shoes-1"];
    days[0].wornAt = "2026-11-16T08:00:00.000Z";
    const result = generateWeeklyOutfits(wardrobe, undefined, days);
    expect(result.days[0].itemIds).toEqual(["tee-1", "sweater-1", "pants-1", "shoes-1"]);
    expect(result.days[0].wornAt).toBe("2026-11-16T08:00:00.000Z");
  });

  it("avoids complete outfits used in recent history when alternatives exist", () => {
    const days = createEmptyWeeklyPlan("2026-11-16").days;
    const history = [{ ...days[0], date: "2026-11-09", itemIds: ["tee-1", "sweater-1", "pants-1", "shoes-1"] }];
    const result = generateWeeklyOutfits(wardrobe, undefined, days, history);
    expect(result.days[0].itemIds?.slice().sort().join("-")).not.toBe("pants-1-shirt-1-shoes-1");
    expect(result.repeatConflicts).toHaveLength(0);
  });

  it("renders a saved outfit from owned wardrobe items even when it is not a current top-ranked suggestion", () => {
    const day = createEmptyWeeklyPlan("2026-11-16").days[0];
    day.itemIds = ["tee-1", "sweater-1", "pants-1", "shoes-1"];
    const items = getOutfitForDay(day, wardrobe);
    expect(items.map((item) => item.id).sort()).toEqual(["pants-1", "shoes-1", "sweater-1", "tee-1"]);
  });

  it("lets the user assign a chosen complete outfit to one day without changing other days", () => {
    const days = createEmptyWeeklyPlan("2026-11-16").days;
    days[0].occasion = "Formal";
    days[1].itemIds = ["shirt-2", "pants-2"];
    const assigned = assignOutfitToDay(days, 0, ["tee-1", "sweater-1", "pants-1", "shoes-1"]);
    expect(assigned[0].itemIds).toEqual(["tee-1", "sweater-1", "pants-1", "shoes-1"]);
    expect(assigned[0].occasion).toBe("Formal");
    expect(assigned[1].itemIds).toEqual(["shirt-2", "pants-2"]);
    expect(() => assignOutfitToDay(days, 0, ["shirt-1"])).toThrow();
  });

  it("refreshes one day without changing the other assigned outfits", () => {
    const days = createEmptyWeeklyPlan("2026-11-16").days;
    const first = generateWeeklyOutfits(wardrobe, undefined, days).days;
    const before = first.filter((_, index) => index !== 3).map((day) => day.itemIds);
    const originalCore = first[3].itemIds?.filter((id) => !id.startsWith("shoes-")).slice().sort().join("-");
    const refreshed = regenerateDayOutfit(wardrobe, undefined, first, 3).days;
    const refreshedCore = refreshed[3].itemIds?.filter((id) => !id.startsWith("shoes-")).slice().sort().join("-");
    expect(refreshedCore).not.toBe(originalCore);
    expect(refreshed.filter((_, index) => index !== 3).map((day) => day.itemIds)).toEqual(before);
    const otherIds = new Set(refreshed.filter((_, index) => index !== 3).map((day) => day.itemIds?.slice().sort().join("-")));
    expect(otherIds.has(refreshed[3].itemIds?.slice().sort().join("-") ?? "")).toBe(false);
  });


  it("keeps the current outfit when refresh has no genuinely different core combination", () => {
    const minimalWardrobe = [
      { id: "tee", name: "White T-shirt", category: "tshirt" as const, color: "#FFFFFF" },
      { id: "sweater", name: "Navy sweater", category: "sweater" as const, color: "#26364A" },
      { id: "pants", name: "Trousers", category: "pants" as const, color: "#252525" },
      { id: "shoes-1", name: "White shoes", category: "shoes" as const, color: "#FFFFFF" },
      { id: "shoes-2", name: "Brown shoes", category: "shoes" as const, color: "#684B35" },
    ];
    const days = createEmptyWeeklyPlan("2026-11-16").days;
    days[0].itemIds = ["tee", "sweater", "pants", "shoes-1"];
    const result = regenerateDayOutfit(minimalWardrobe, undefined, days, 0);
    expect(result.days[0].itemIds).toEqual(["tee", "sweater", "pants", "shoes-1"]);
    expect(result.repeatConflict).toBe(true);
  });

  it("ranks clothing differently for formal and sport contexts", () => {
    const formalLook = {
      items: [
        { id: "shirt", name: "Oxford shirt", category: "shirt" },
        { id: "trousers", name: "Tailored trousers", category: "pants" },
      ],
    } as unknown as Parameters<typeof getOccasionFit>[0];
    const sportLook = {
      items: [
        { id: "tee", name: "Running tee", category: "tshirt" },
        { id: "shoes", name: "Running shoes", category: "shoes" },
      ],
    } as Parameters<typeof getOccasionFit>[0];
    expect(getOccasionFit(formalLook, "Formal")).toBeGreaterThan(getOccasionFit(sportLook, "Formal"));
    expect(getOccasionFit(sportLook, "Sport")).toBeGreaterThan(getOccasionFit(formalLook, "Sport"));
  });

  it("uses optional temperature preferences to favour or avoid extra layers", () => {
    const layered = {
      items: [{ id: "sweater", name: "Sweater", category: "sweater" }],
    } as unknown as Parameters<typeof getWeatherFit>[0];
    expect(getWeatherFit(layered, "Cold")).toBeGreaterThan(getWeatherFit(layered, "Warm"));
  });

  it("does not repeat a recent core look just to fill all seven days", () => {
    const minimalWardrobe = [
      { id: "tee", name: "White T-shirt", category: "tshirt" as const, color: "#FFFFFF" },
      { id: "sweater", name: "Navy sweater", category: "sweater" as const, color: "#26364A" },
      { id: "pants", name: "Trousers", category: "pants" as const, color: "#252525" },
      { id: "shoes", name: "Brown shoes", category: "shoes" as const, color: "#684B35" },
    ];
    const days = createEmptyWeeklyPlan("2026-11-16").days;
    const history = [{ ...days[0], date: "2026-11-09", itemIds: ["tee", "sweater", "pants", "shoes"] }];
    const result = generateWeeklyOutfits(minimalWardrobe, undefined, days, history);
    expect(result.days.every((day) => day.itemIds === null)).toBe(true);
    expect(result.repeatConflicts).toEqual([]);
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
