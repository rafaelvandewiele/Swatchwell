import { describe, expect, it } from "vitest";
import {
  buildGarmentInsights,
  buildOutfitUsage,
  calculateCostPerWear,
  getCategoryDistribution,
  getColourDistribution,
} from "./insights";

const wardrobe = [
  { id: "shirt", name: "Oxford shirt", category: "Shirts", color: "#FFFFFF", purchasePrice: 60 },
  { id: "trousers", name: "Chinos", category: "Trousers", color: "#FFFFFF" },
  { id: "shoes", name: "Loafers", category: "Shoes", color: "#654321", purchasePrice: 120 },
];

const events = [
  { id: "1", item_id: "shirt", worn_on: "2026-11-01" },
  { id: "2", item_id: "shirt", worn_on: "2026-11-08" },
  { id: "3", item_id: "trousers", worn_on: "2026-11-08" },
  { id: "4", item_id: "shoes", worn_on: "2026-11-08" },
];

describe("wardrobe insights calculations", () => {
  it("calculates cost per wear only when price and wear count exist", () => {
    expect(calculateCostPerWear(60, 3)).toBe(20);
    expect(calculateCostPerWear(undefined, 3)).toBeNull();
    expect(calculateCostPerWear(60, 0)).toBeNull();
    expect(calculateCostPerWear(-1, 2)).toBeNull();
  });

  it("counts explicit wear events and keeps never-worn garments visible", () => {
    const result = buildGarmentInsights(wardrobe, events, new Date("2026-11-20T12:00:00Z"));
    expect(result.find((x) => x.item.id === "shirt")?.wearCount).toBe(2);
    expect(result.find((x) => x.item.id === "shirt")?.costPerWear).toBe(30);
    expect(result.find((x) => x.item.id === "trousers")?.wearCount).toBe(1);
    expect(result.find((x) => x.item.id === "shoes")?.lastWorn).toBe("2026-11-08");
  });

  it("keeps garments with no recorded wear visible without inventing a cost per wear", () => {
    const result = buildGarmentInsights([{ id: "new", name: "New piece", category: "Shirts", color: "#000000", purchasePrice: 45 }], [], new Date("2026-11-20T12:00:00Z"));
    expect(result[0].wearCount).toBe(0);
    expect(result[0].lastWorn).toBeNull();
    expect(result[0].daysSinceWorn).toBeNull();
    expect(result[0].costPerWear).toBeNull();
  });

  it("groups same-day garment events into actual outfit usage", () => {
    expect(buildOutfitUsage(events)).toEqual([
      { date: "2026-11-08", itemIds: ["shirt", "shoes", "trousers"], count: 3 },
    ]);
  });

  it("builds category and colour distributions without inventing values", () => {
    expect(getCategoryDistribution(wardrobe)).toEqual([
      { category: "Shirts", count: 1 },
      { category: "Shoes", count: 1 },
      { category: "Trousers", count: 1 },
    ]);
    expect(getColourDistribution(wardrobe)).toEqual([
      { colour: "#FFFFFF", count: 2 },
      { colour: "#654321", count: 1 },
    ]);
  });
});
