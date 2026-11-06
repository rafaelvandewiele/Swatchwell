import type { ColorSeason } from "./seasonal-analysis";

export type PaletteColorCategory =
  | "neutral"
  | "accent"
  | "statement";

export interface SeasonalPaletteColor {
  name: string;
  hex: `#${string}`;
  category: PaletteColorCategory;
}

export interface SeasonalPalette {
  season: ColorSeason;
  colors: SeasonalPaletteColor[];
}

const palettes: Record<ColorSeason, SeasonalPaletteColor[]> = {
  spring: [
    { name: "Ivory", hex: "#F5EBD5", category: "neutral" },
    { name: "Warm Cream", hex: "#F3DFC0", category: "neutral" },
    { name: "Camel", hex: "#C69B6D", category: "neutral" },
    { name: "Warm Taupe", hex: "#A58A70", category: "neutral" },
    { name: "Peach", hex: "#F4A98A", category: "accent" },
    { name: "Coral", hex: "#EF806D", category: "accent" },
    { name: "Apricot", hex: "#F5B66C", category: "accent" },
    { name: "Fresh Green", hex: "#91B86A", category: "accent" },
    { name: "Turquoise", hex: "#48B9AE", category: "statement" },
    { name: "Clear Aqua", hex: "#65C8C5", category: "statement" },
    { name: "Warm Blue", hex: "#579CC0", category: "statement" },
    { name: "Poppy Red", hex: "#E75D4F", category: "statement" },
  ],

  summer: [
    { name: "Soft White", hex: "#F0EDE8", category: "neutral" },
    { name: "Rose Beige", hex: "#CBB9B2", category: "neutral" },
    { name: "Cool Taupe", hex: "#A99B98", category: "neutral" },
    { name: "Soft Navy", hex: "#536477", category: "neutral" },
    { name: "Dusty Rose", hex: "#C88F9A", category: "accent" },
    { name: "Powder Pink", hex: "#DDB6C0", category: "accent" },
    { name: "Mauve", hex: "#A987A5", category: "accent" },
    { name: "Sage", hex: "#9BAE9A", category: "accent" },
    { name: "Lavender", hex: "#A9A1C8", category: "statement" },
    { name: "Periwinkle", hex: "#899FC5", category: "statement" },
    { name: "Denim Blue", hex: "#6686A7", category: "statement" },
    { name: "Berry", hex: "#985D78", category: "statement" },
  ],

  autumn: [
    { name: "Ivory", hex: "#E9DDC5", category: "neutral" },
    { name: "Warm Beige", hex: "#C7AA83", category: "neutral" },
    { name: "Cognac", hex: "#A66D43", category: "neutral" },
    { name: "Dark Chocolate", hex: "#574033", category: "neutral" },
    { name: "Terracotta", hex: "#C46E4E", category: "accent" },
    { name: "Rust", hex: "#A94F32", category: "accent" },
    { name: "Mustard", hex: "#C49A3A", category: "accent" },
    { name: "Olive", hex: "#85834A", category: "accent" },
    { name: "Forest Green", hex: "#48634A", category: "statement" },
    { name: "Petrol", hex: "#376B68", category: "statement" },
    { name: "Deep Teal", hex: "#315C5A", category: "statement" },
    { name: "Warm Burgundy", hex: "#783F3D", category: "statement" },
  ],

  winter: [
    { name: "Pure White", hex: "#F5F5F2", category: "neutral" },
    { name: "Cool Grey", hex: "#A8ADB5", category: "neutral" },
    { name: "Charcoal", hex: "#41444B", category: "neutral" },
    { name: "Black", hex: "#202126", category: "neutral" },
    { name: "Royal Blue", hex: "#315AA8", category: "accent" },
    { name: "Emerald", hex: "#087B65", category: "accent" },
    { name: "Fuchsia", hex: "#C33A85", category: "accent" },
    { name: "Icy Pink", hex: "#E5B9D0", category: "accent" },
    { name: "True Red", hex: "#C52E3C", category: "statement" },
    { name: "Cobalt", hex: "#2449C6", category: "statement" },
    { name: "Deep Purple", hex: "#633C91", category: "statement" },
    { name: "Icy Blue", hex: "#A8D3E8", category: "statement" },
  ],
};

/**
 * Returns a copy of the palette for the requested season.
 */
export function getSeasonalPalette(
  season: ColorSeason,
): SeasonalPalette {
  return {
    season,
    colors: palettes[season].map((color) => ({ ...color })),
  };
}

/**
 * Returns copies of all four seasonal palettes.
 */
export function getAllSeasonalPalettes(): SeasonalPalette[] {
  const seasons: ColorSeason[] = [
    "spring",
    "summer",
    "autumn",
    "winter",
  ];

  return seasons.map(getSeasonalPalette);
}
