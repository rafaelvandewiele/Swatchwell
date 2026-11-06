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
