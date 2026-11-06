import type { ColorSeason, SubSeason } from "./seasonal-analysis";
import { getSubSeasonLabel } from "./seasonal-analysis";

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

export interface SubSeasonalPalette extends SeasonalPalette {
  subSeason: SubSeason;
  label: string;
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

const SUB_SEASONS: SubSeason[] = [
  "light-spring", "true-spring", "bright-spring",
  "light-summer", "true-summer", "soft-summer",
  "soft-autumn", "true-autumn", "deep-autumn",
  "deep-winter", "true-winter", "bright-winter",
];

function hexToHsl(hex: string) {
  const value = hex.slice(1);
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));
    if (max === r) h = 60 * (((g - b) / delta) % 6);
    else if (max === g) h = 60 * ((b - r) / delta + 2);
    else h = 60 * ((r - g) / delta + 4);
  }

  return { h: (h + 360) % 360, s: s * 100, l: l * 100 };
}

function hslToHex(h: number, s: number, l: number): `#${string}` {
  const saturation = Math.max(0, Math.min(100, s)) / 100;
  const lightness = Math.max(5, Math.min(95, l)) / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = chroma * (1 - Math.abs((h / 60) % 2 - 1));
  const m = lightness - chroma / 2;

  let rgb: [number, number, number];

  if (h < 60) rgb = [chroma, x, 0];
  else if (h < 120) rgb = [x, chroma, 0];
  else if (h < 180) rgb = [0, chroma, x];
  else if (h < 240) rgb = [0, x, chroma];
  else if (h < 300) rgb = [x, 0, chroma];
  else rgb = [chroma, 0, x];

  return `#${rgb.map((channel) =>
    Math.round((channel + m) * 255).toString(16).padStart(2, "0")
  ).join("")}`;
}

function getSeasonForSubSeason(subSeason: SubSeason): ColorSeason {
  return subSeason.split("-")[1] as ColorSeason;
}

function transformColor(hex: string, subSeason: SubSeason): `#${string}` {
  const hsl = hexToHsl(hex);
  let saturation = 0;
  let lightness = 0;

  switch (subSeason.split("-")[0]) {
    case "light":
      saturation = -4;
      lightness = 9;
      break;
    case "bright":
      saturation = 17;
      lightness = 2;
      break;
    case "soft":
      saturation = -19;
      lightness = 3;
      break;
    case "deep":
      saturation = -3;
      lightness = -12;
      break;
    default:
      break;
  }

  return hslToHex(hsl.h, hsl.s + saturation, hsl.l + lightness);
}

export function getSeasonalPalette(season: ColorSeason): SeasonalPalette {
  return {
    season,
    colors: palettes[season].map((color) => ({ ...color })),
  };
}

export function getSubSeasonalPalette(
  subSeason: SubSeason,
): SubSeasonalPalette {
  const season = getSeasonForSubSeason(subSeason);
  const base = getSeasonalPalette(season);

  return {
    season,
    subSeason,
    label: getSubSeasonLabel(subSeason),
    colors: base.colors.map((color) => ({
      ...color,
      hex: transformColor(color.hex, subSeason),
    })),
  };
}

export function getAllSeasonalPalettes(): SeasonalPalette[] {
  return (["spring", "summer", "autumn", "winter"] as const)
    .map(getSeasonalPalette);
}

export function getAllSubSeasonalPalettes(): SubSeasonalPalette[] {
  return SUB_SEASONS.map(getSubSeasonalPalette);
}
