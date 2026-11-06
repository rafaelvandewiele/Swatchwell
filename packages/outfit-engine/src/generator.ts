import type {
  ClothingCategory,
  ClothingItem,
} from "@swatchwell/shared";
import type { ColorSeason } from "@swatchwell/color-engine";

import {
  analyzeOutfitHarmony,
  type OutfitHarmonyResult,
} from "./index";

export interface OutfitGeneratorOptions {
  season?: ColorSeason;
  limit?: number;
  includeJackets?: boolean;
  includeAccessories?: boolean;
}

export interface OutfitRecommendation {
  id: string;
  items: ClothingItem[];
  score: number;
  rating: OutfitHarmonyResult["rating"];
  harmony: OutfitHarmonyResult;
  explanation: string[];
}

const BASE_TOP_CATEGORIES: ClothingCategory[] = [
  "shirt",
  "tshirt",
  "polo",
];

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const MAX_CANDIDATES = 5000;

function validateWardrobe(items: ClothingItem[]): void {
  if (!Array.isArray(items)) {
    throw new TypeError("Wardrobe must be an array.");
  }

  const ids = new Set<string>();

  for (const item of items) {
    if (
      !item ||
      typeof item.id !== "string" ||
      item.id.trim().length === 0 ||
      typeof item.name !== "string" ||
      item.name.trim().length === 0 ||
      typeof item.category !== "string" ||
      typeof item.color !== "string"
    ) {
      throw new TypeError(
        "Every clothing item must have a valid ID, name, category and color.",
      );
    }

    if (ids.has(item.id)) {
      throw new RangeError("Wardrobe item IDs must be unique.");
    }

    ids.add(item.id);

    if (
      item.extraColors !== undefined &&
      (!Array.isArray(item.extraColors) ||
        !item.extraColors.every((color) => typeof color === "string"))
    ) {
      throw new TypeError("Extra colors must be an array of strings.");
    }
  }
}

function validateOptions(options: OutfitGeneratorOptions): number {
  const limit = options.limit ?? DEFAULT_LIMIT;

  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new RangeError(
      `Limit must be an integer between 1 and ${MAX_LIMIT}.`,
    );
  }

  return limit;
}

function createRecommendation(
  items: ClothingItem[],
  season?: ColorSeason,
): OutfitRecommendation {
  const harmony = analyzeOutfitHarmony(
    items.map((item) => ({
      id: item.id,
      name: item.name,
      color: item.color,
      ...(item.extraColors?.length
        ? { extraColors: item.extraColors }
        : {}),
    })),
    season,
  );

  const explanation = [...harmony.recommendations];

  if (harmony.seasonalCompatibility !== undefined) {
    explanation.push(
      `Seasonal palette compatibility: ${harmony.seasonalCompatibility}/100.`,
    );
  }

  return {
    id: items.map((item) => item.id).sort().join("-"),
    items,
    score: harmony.score,
    rating: harmony.rating,
    harmony,
    explanation,
  };
}

export function generateOutfits(
  wardrobe: ClothingItem[],
  options: OutfitGeneratorOptions = {},
): OutfitRecommendation[] {
  validateWardrobe(wardrobe);

  const limit = validateOptions(options);

  const baseTops = wardrobe.filter((item) =>
    BASE_TOP_CATEGORIES.includes(item.category),
  );

  const sweaters = wardrobe.filter(
    (item) => item.category === "sweater",
  );

  const pants = wardrobe.filter(
    (item) => item.category === "pants",
  );

  const shoes = wardrobe.filter(
    (item) => item.category === "shoes",
  );

  const jackets =
    options.includeJackets === false
      ? []
      : wardrobe.filter((item) => item.category === "jacket");

  const accessories =
    options.includeAccessories === false
      ? []
      : wardrobe.filter((item) => item.category === "accessory");

  if (baseTops.length === 0 || pants.length === 0) {
    return [];
  }

  const shoeOptions: Array<ClothingItem | undefined> =
    shoes.length > 0 ? shoes : [undefined];

  const sweaterOptions: Array<ClothingItem | undefined> =
    [undefined, ...sweaters];

  const jacketOptions: Array<ClothingItem | undefined> =
    [undefined, ...jackets];

  const accessoryOptions: Array<ClothingItem | undefined> =
    [undefined, ...accessories];

  const recommendations: OutfitRecommendation[] = [];
  const seen = new Set<string>();

  for (const top of baseTops) {
    for (const bottom of pants) {
      for (const shoe of shoeOptions) {
        for (const sweater of sweaterOptions) {
          for (const jacket of jacketOptions) {
            for (const accessory of accessoryOptions) {
              const outfit = [
                top,
                bottom,
                shoe,
                sweater,
                jacket,
                accessory,
              ].filter(
                (item): item is ClothingItem => item !== undefined,
              );

              const id = outfit
                .map((item) => item.id)
                .sort()
                .join("-");

              if (seen.has(id)) continue;

              seen.add(id);

              recommendations.push(
                createRecommendation(outfit, options.season),
              );

              if (recommendations.length >= MAX_CANDIDATES) {
                break;
              }
            }

            if (recommendations.length >= MAX_CANDIDATES) break;
          }

          if (recommendations.length >= MAX_CANDIDATES) break;
        }

        if (recommendations.length >= MAX_CANDIDATES) break;
      }

      if (recommendations.length >= MAX_CANDIDATES) break;
    }

    if (recommendations.length >= MAX_CANDIDATES) break;
  }

  return recommendations
    .sort(
      (first, second) =>
        second.score - first.score ||
        first.id.localeCompare(second.id),
    )
    .slice(0, limit);
}
