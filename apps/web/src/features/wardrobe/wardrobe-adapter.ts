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

const CATEGORY_ALIASES: Record<string, WardrobeCategory> = {
  shirt: "Shirts",
  tshirt: "T-shirts",
  polo: "Polo shirts",
  sweater: "Sweaters",
  pants: "Trousers",
  jacket: "Outerwear",
  shoes: "Shoes",
  accessory: "Accessories",
};

export function normalizeWardrobeGarment(value: unknown): WardrobeGarment | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (
    typeof item.id !== "string" || !item.id.trim() ||
    typeof item.name !== "string" || !item.name.trim() ||
    typeof item.category !== "string"
  ) return null;

  const category = item.category === "Knitwear"
    ? "Sweaters"
    : Object.prototype.hasOwnProperty.call(CATEGORY_MAP, item.category)
      ? item.category as WardrobeCategory
      : CATEGORY_ALIASES[item.category];

  if (!category) return null;
  const color = typeof item.color === "string" && /^#[0-9a-fA-F]{6}$/.test(item.color)
    ? item.color
    : "#D8D4C9";
  const extraColors = Array.isArray(item.extraColors)
    ? [...new Set(item.extraColors.filter((entry): entry is string =>
        typeof entry === "string" && /^#[0-9a-fA-F]{6}$/.test(entry),
      ))].slice(0, 5)
    : [];

  return {
    id: item.id,
    name: item.name,
    category,
    color,
    ...(extraColors.length ? { extraColors } : {}),
  };
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
