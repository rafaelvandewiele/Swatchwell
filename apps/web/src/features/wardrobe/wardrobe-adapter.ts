import type { ClothingCategory, ClothingItem } from "@swatchwell/shared";

export type WardrobeCategory =
  | "Shirts"
  | "T-shirts"
  | "Polo shirts"
  | "Sweaters"
  | "Knitwear"
  | "Trousers"
  | "Outerwear"
  | "Shoes"
  | "Accessories";

export const CATEGORY_MAP: Record<WardrobeCategory, ClothingCategory> = {
  Shirts: "shirt",
  "T-shirts": "tshirt",
  "Polo shirts": "polo",
  Sweaters: "sweater",
  Knitwear: "sweater",
  Trousers: "pants",
  Outerwear: "jacket",
  Shoes: "shoes",
  Accessories: "accessory",
};

export interface WardrobeGarment {
  id: string;
  name: string;
  category: WardrobeCategory;
  color: string;
  extraColors?: string[];
}

export function toGeneratorItem(item: WardrobeGarment): ClothingItem {
  return {
    id: item.id,
    name: item.name,
    category: CATEGORY_MAP[item.category],
    color: item.color,
    ...(item.extraColors?.length
      ? { extraColors: item.extraColors }
      : {}),
  };
}

export function toGeneratorWardrobe(
  items: WardrobeGarment[],
): ClothingItem[] {
  return items.map(toGeneratorItem);
}

export function sortOutfitLayers<T extends { category: string }>(items: readonly T[]): T[] {
  const order: Record<string, number> = {
    shoes: 0, Shoes: 0,
    pants: 1, Trousers: 1,
    shirt: 2, Shirts: 2, tshirt: 2, "T-shirts": 2, polo: 2, "Polo shirts": 2,
    sweater: 3, Sweaters: 3, Knitwear: 3,
    jacket: 4, Outerwear: 4,
    accessory: 5, Accessories: 5,
  };
  return [...items].sort((a, b) => (order[a.category] ?? 99) - (order[b.category] ?? 99));
}
