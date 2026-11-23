export const STYLE_FORMALITY_LEVELS = ["Relaxed", "Casual", "Smart", "Formal"] as const;
export type StyleFormality = (typeof STYLE_FORMALITY_LEVELS)[number];
export const STYLE_CATEGORIES = ["Shirts", "T-shirts", "Polo shirts", "Sweaters", "Trousers", "Outerwear", "Shoes", "Accessories"] as const;
export type StyleCategory = (typeof STYLE_CATEGORIES)[number];

export interface StyleProfile {
  id: string;
  name: string;
  is_default: boolean;
  preferred_categories: StyleCategory[];
  preferred_colours: string[];
  formality: StyleFormality;
  excluded_item_ids: string[];
  created_at?: string;
  updated_at?: string;
}

export type StyleProfileInput = Omit<StyleProfile, "id" | "created_at" | "updated_at">;

export const DEFAULT_STYLE_PROFILE: StyleProfileInput = {
  name: "Everyday",
  is_default: true,
  preferred_categories: [...STYLE_CATEGORIES],
  preferred_colours: [],
  formality: "Casual",
  excluded_item_ids: [],
};

const FORMALITY_SCORE: Record<StyleFormality, Record<string, number>> = {
  Relaxed: { tshirt: 2, shoes: 0, sweater: 1, pants: 0, shirt: -1, polo: 1, jacket: 0, accessory: 0 },
  Casual: { tshirt: 1, shoes: 0, sweater: 1, pants: 1, shirt: 0, polo: 1, jacket: 0, accessory: 0 },
  Smart: { tshirt: -1, shoes: 1, sweater: 1, pants: 2, shirt: 2, polo: 1, jacket: 1, accessory: 1 },
  Formal: { tshirt: -3, shoes: 1, sweater: 0, pants: 2, shirt: 3, polo: -1, jacket: 2, accessory: 1 },
};

export function normalizeStyleProfile(value: unknown): StyleProfile | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const profile = value as Record<string, unknown>;
  if (typeof profile.id !== "string" || typeof profile.name !== "string") return null;
  const categories = Array.isArray(profile.preferred_categories)
    ? profile.preferred_categories.filter((entry): entry is StyleCategory => typeof entry === "string" && (STYLE_CATEGORIES as readonly string[]).includes(entry))
    : [...STYLE_CATEGORIES];
  const colours = Array.isArray(profile.preferred_colours)
    ? profile.preferred_colours.filter((entry): entry is string => typeof entry === "string" && /^#[0-9a-f]{6}$/i.test(entry)).slice(0, 12)
    : [];
  const excluded = Array.isArray(profile.excluded_item_ids)
    ? profile.excluded_item_ids.filter((entry): entry is string => typeof entry === "string")
    : [];
  const formality = STYLE_FORMALITY_LEVELS.includes(profile.formality as StyleFormality) ? profile.formality as StyleFormality : "Casual";
  return {
    id: profile.id,
    name: profile.name.trim().slice(0, 48) || "My style",
    is_default: profile.is_default === true,
    preferred_categories: categories,
    preferred_colours: colours,
    formality,
    excluded_item_ids: excluded,
    ...(typeof profile.created_at === "string" ? { created_at: profile.created_at } : {}),
    ...(typeof profile.updated_at === "string" ? { updated_at: profile.updated_at } : {}),
  };
}

export function getStyleProfileFit(
  outfit: { items: Array<{ category: string; color: string }> },
  profile: Pick<StyleProfile, "preferred_categories" | "preferred_colours" | "formality">,
): number {
  const categorySet = new Set(profile.preferred_categories);
  const colourSet = new Set(profile.preferred_colours.map((colour) => colour.toLowerCase()));
  return outfit.items.reduce((score, item) => {
    const category = item.category === "tshirt" ? "T-shirts"
      : item.category === "shirt" ? "Shirts"
      : item.category === "polo" ? "Polo shirts"
      : item.category === "sweater" ? "Sweaters"
      : item.category === "pants" ? "Trousers"
      : item.category === "jacket" ? "Outerwear"
      : item.category === "shoes" ? "Shoes" : "Accessories";
    const categoryScore = categorySet.has(category as StyleCategory) ? 1 : -1;
    const colourScore = colourSet.size === 0 ? 0 : colourSet.has(item.color.toLowerCase()) ? 2 : 0;
    return score + categoryScore + colourScore + (FORMALITY_SCORE[profile.formality][item.category] ?? 0);
  }, 0);
}

export function applyStyleProfile<T extends { items: Array<{ id: string; category: string; color: string }> }>(
  outfits: T[],
  profile: StyleProfile,
): T[] {
  const excluded = new Set(profile.excluded_item_ids);
  return outfits
    .filter((outfit) => outfit.items.every((item) => !excluded.has(item.id)))
    .map((outfit) => ({ outfit, fit: getStyleProfileFit(outfit, profile) }))
    .sort((a, b) => b.fit - a.fit)
    .map(({ outfit }) => outfit);
}
