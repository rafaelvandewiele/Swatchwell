import { describe, expect, it } from "vitest";
import {
  toGeneratorItem,
  toGeneratorWardrobe,
} from "./wardrobe-adapter";

describe("Wardrobe adapter", () => {
  it("converts every wardrobe category correctly", () => {
    const categories = [
      ["Shirts", "shirt"],
      ["T-shirts", "tshirt"],
      ["Knitwear", "sweater"],
      ["Trousers", "pants"],
      ["Outerwear", "jacket"],
      ["Shoes", "shoes"],
      ["Accessories", "accessory"],
    ] as const;

    for (const [category, expected] of categories) {
      expect(
        toGeneratorItem({
          id: "test",
          name: "Test garment",
          category,
          color: "#ffffff",
        }).category,
      ).toBe(expected);
    }
  });

  it("preserves IDs, names and colors", () => {
    const result = toGeneratorItem({
      id: "shirt-1",
      name: "Oxford shirt",
      category: "Shirts",
      color: "#F5F0E5",
    });

    expect(result).toEqual({
      id: "shirt-1",
      name: "Oxford shirt",
      category: "shirt",
      color: "#F5F0E5",
    });
  });

  it("converts a complete wardrobe", () => {
    const result = toGeneratorWardrobe([
      {
        id: "1",
        name: "Shirt",
        category: "Shirts",
        color: "#ffffff",
      },
      {
        id: "2",
        name: "Trousers",
        category: "Trousers",
        color: "#26364A",
      },
    ]);

    expect(result).toHaveLength(2);
    expect(result[0].category).toBe("shirt");
    expect(result[1].category).toBe("pants");
  });

  it("does not mutate the original wardrobe", () => {
    const original = {
      id: "1",
      name: "Shirt",
      category: "Shirts" as const,
      color: "#ffffff",
    };

    const snapshot = { ...original };

    toGeneratorItem(original);

    expect(original).toEqual(snapshot);
  });
});
