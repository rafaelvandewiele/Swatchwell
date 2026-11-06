import { describe, expect, it } from "vitest";
import { analyzeOutfitHarmony } from "./index";

const garments = [
  { id: "1", name: "Shirt", color: "#F5EBD5" },
  { id: "2", name: "Trousers", color: "#C69B6D" },
  { id: "3", name: "Jacket", color: "#A58A70" },
  { id: "4", name: "Shoes", color: "#574033" },
  { id: "5", name: "Accessory", color: "#85834A" },
];

describe("Outfit harmony", () => {
  it("analyzes a two-piece outfit", () => {
    const result = analyzeOutfitHarmony(garments.slice(0, 2));

    expect(result.garmentCount).toBe(2);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("analyzes a three-piece outfit", () => {
    const result = analyzeOutfitHarmony(garments.slice(0, 3));

    expect(result.garmentCount).toBe(3);
  });

  it("analyzes a five-piece outfit", () => {
    const result = analyzeOutfitHarmony(garments);

    expect(result.garmentCount).toBe(5);
    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  it("supports seasonal compatibility", () => {
    const result = analyzeOutfitHarmony(garments.slice(0, 3), "autumn");

    expect(result.seasonalCompatibility).toBeDefined();
    expect(result.seasonalCompatibility).toBeGreaterThanOrEqual(0);
    expect(result.seasonalCompatibility).toBeLessThanOrEqual(100);
  });

  it("normalizes garment HEX colors", () => {
    const result = analyzeOutfitHarmony([
      { id: "1", name: "Shirt", color: "#fff" },
      { id: "2", name: "Pants", color: "#000" },
    ]);

    expect(result.normalizedGarments[0].color).toBe("#ffffff");
  });

  it("rejects an empty outfit", () => {
    expect(() => analyzeOutfitHarmony([])).toThrow(RangeError);
  });

  it("rejects an outfit with only one garment", () => {
    expect(() => analyzeOutfitHarmony(garments.slice(0, 1))).toThrow(
      RangeError,
    );
  });

  it("rejects invalid colors", () => {
    expect(() =>
      analyzeOutfitHarmony([
        { id: "1", name: "Shirt", color: "invalid" },
        { id: "2", name: "Pants", color: "#000000" },
      ]),
    ).toThrow();
  });

  it("rejects duplicate garment IDs", () => {
    expect(() =>
      analyzeOutfitHarmony([
        { id: "same", name: "Shirt", color: "#ffffff" },
        { id: "same", name: "Pants", color: "#000000" },
      ]),
    ).toThrow(RangeError);
  });

  it("returns deterministic results", () => {
    const first = analyzeOutfitHarmony(garments.slice(0, 3), "spring");
    const second = analyzeOutfitHarmony(garments.slice(0, 3), "spring");

    expect(first).toEqual(second);
  });
});
