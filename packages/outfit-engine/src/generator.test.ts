import { describe, expect, it } from "vitest";
import { generateOutfits } from "./generator";
import { analyzeOutfitHarmony } from "./index";
import type { ClothingItem } from "@swatchwell/shared";

const wardrobe: ClothingItem[] = [
  { id: "shirt-1", name: "White shirt", category: "shirt", color: "#F5F0E5" },
  { id: "shirt-2", name: "Blue shirt", category: "shirt", color: "#526B85" },
  { id: "pants-1", name: "Beige trousers", category: "pants", color: "#C6AD8A" },
  { id: "pants-2", name: "Navy trousers", category: "pants", color: "#26364A" },
  { id: "shoes-1", name: "Brown shoes", category: "shoes", color: "#684B35" },
  { id: "jacket-1", name: "Navy jacket", category: "jacket", color: "#26364A" },
  { id: "accessory-1", name: "Brown belt", category: "accessory", color: "#684B35" },
];

describe("Outfit generator", () => {
  it("generates outfits from tops and trousers", () => {
    const results = generateOutfits(wardrobe);

    expect(results.length).toBeGreaterThan(0);

    expect(
      results.every(
        (outfit) =>
          outfit.items.some((item) =>
            ["shirt", "tshirt", "polo"].includes(item.category),
          ) && outfit.items.some((item) => item.category === "pants"),
      ),
    ).toBe(true);
  });

  it("includes shoes when shoes are available", () => {
    const results = generateOutfits(wardrobe, { limit: 50 });

    expect(results.length).toBeGreaterThan(0);

    expect(
      results.every((outfit) =>
        outfit.items.some((item) => item.category === "shoes"),
      ),
    ).toBe(true);
  });

  it("includes optional clothing categories", () => {
    const results = generateOutfits(wardrobe, { limit: 50 });

    expect(
      results.some((outfit) =>
        outfit.items.some((item) => item.category === "jacket"),
      ),
    ).toBe(true);

    expect(
      results.some((outfit) =>
        outfit.items.some((item) => item.category === "accessory"),
      ),
    ).toBe(true);
  });

  it("can exclude jackets and accessories", () => {
    const results = generateOutfits(wardrobe, {
      includeJackets: false,
      includeAccessories: false,
    });

    expect(
      results.every((outfit) =>
        outfit.items.every(
          (item) =>
            item.category !== "jacket" &&
            item.category !== "accessory",
        ),
      ),
    ).toBe(true);
  });

  it("supports seasonal compatibility", () => {
    const results = generateOutfits(wardrobe, {
      season: "autumn",
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].harmony.seasonalCompatibility).toBeDefined();
  });

  it("sorts results by score, highest first", () => {
    const results = generateOutfits(wardrobe, { limit: 50 });

    for (let i = 1; i < results.length; i += 1) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(
        results[i].score,
      );
    }
  });

  it("respects the requested result limit", () => {
    expect(generateOutfits(wardrobe, { limit: 2 })).toHaveLength(2);
  });

  it("returns no outfits if there are no trousers", () => {
    const results = generateOutfits(
      wardrobe.filter((item) => item.category !== "pants"),
    );

    expect(results).toEqual([]);
  });

  it("returns no outfits if there are no base tops", () => {
    const results = generateOutfits(
      wardrobe.filter(
        (item) => !["shirt", "tshirt", "polo"].includes(item.category),
      ),
    );

    expect(results).toEqual([]);
  });

  it("does not use a sweater as a replacement for a base top", () => {
    const sweaterOnlyWardrobe: ClothingItem[] = [
      {
        id: "sweater",
        name: "Navy sweater",
        category: "sweater",
        color: "#26364A",
      },
      {
        id: "pants",
        name: "Beige trousers",
        category: "pants",
        color: "#C6AD8A",
      },
    ];

    expect(generateOutfits(sweaterOnlyWardrobe)).toEqual([]);
  });

  it("supports polo shirts as base tops", () => {
    const poloWardrobe: ClothingItem[] = [
      {
        id: "polo",
        name: "White polo",
        category: "polo",
        color: "#FFFFFF",
      },
      {
        id: "pants",
        name: "Navy trousers",
        category: "pants",
        color: "#26364A",
      },
    ];

    const results = generateOutfits(poloWardrobe);

    expect(results.length).toBeGreaterThan(0);

    expect(
      results.every((outfit) =>
        outfit.items.some((item) => item.category === "polo"),
      ),
    ).toBe(true);
  });

  it("can add a sweater as an extra layer over a base top", () => {
    const layeredWardrobe: ClothingItem[] = [
      {
        id: "shirt",
        name: "White shirt",
        category: "shirt",
        color: "#FFFFFF",
      },
      {
        id: "sweater",
        name: "Navy sweater",
        category: "sweater",
        color: "#26364A",
      },
      {
        id: "pants",
        name: "Beige trousers",
        category: "pants",
        color: "#C6AD8A",
      },
    ];

    const results = generateOutfits(layeredWardrobe, { limit: 50 });

    expect(
      results.some(
        (outfit) =>
          outfit.items.some((item) => item.category === "shirt") &&
          outfit.items.some((item) => item.category === "sweater"),
      ),
    ).toBe(true);
  });

  it("includes extra garment colours in harmony analysis", () => {
    const withExtraColor = analyzeOutfitHarmony([
      {
        id: "shirt",
        name: "Striped shirt",
        color: "#FFFFFF",
        extraColors: ["#26364A"],
      },
      {
        id: "pants",
        name: "Navy trousers",
        color: "#26364A",
      },
    ]);

    const withoutExtraColor = analyzeOutfitHarmony([
      {
        id: "shirt",
        name: "White shirt",
        color: "#FFFFFF",
      },
      {
        id: "pants",
        name: "Navy trousers",
        color: "#26364A",
      },
    ]);

    expect(withExtraColor.averageColorDifference).not.toBe(
      withoutExtraColor.averageColorDifference,
    );
  });

  it("returns an empty array for an empty wardrobe", () => {
    expect(generateOutfits([])).toEqual([]);
  });

  it("rejects duplicate wardrobe IDs", () => {
    expect(() =>
      generateOutfits([
        wardrobe[0],
        { ...wardrobe[1], id: wardrobe[0].id },
        wardrobe[2],
      ]),
    ).toThrow(RangeError);
  });

  it("rejects an invalid result limit", () => {
    expect(() => generateOutfits(wardrobe, { limit: 100 })).toThrow(
      RangeError,
    );
  });

  it("produces deterministic recommendations", () => {
    expect(generateOutfits(wardrobe)).toEqual(
      generateOutfits(wardrobe),
    );
  });
});
