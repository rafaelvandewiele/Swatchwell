import { describe, expect, it } from "vitest";
import {
  getAllSeasonalPalettes,
  getSeasonalPalette,
} from "./seasonal-palettes";

const seasons = ["spring", "summer", "autumn", "winter"] as const;

describe("Seasonal palettes", () => {
  it("provides a palette for every season", () => {
    const palettes = getAllSeasonalPalettes();

    expect(palettes).toHaveLength(4);
    expect(palettes.map((palette) => palette.season)).toEqual(seasons);
  });

  it.each(seasons)("provides 12 colors for %s", (season) => {
    const palette = getSeasonalPalette(season);

    expect(palette.colors).toHaveLength(12);
    expect(palette.season).toBe(season);
  });

  it.each(seasons)("provides valid HEX colors for %s", (season) => {
    const palette = getSeasonalPalette(season);

    for (const color of palette.colors) {
      expect(color.hex).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it.each(seasons)("provides unique colors for %s", (season) => {
    const palette = getSeasonalPalette(season);
    const hexValues = palette.colors.map((color) => color.hex);

    expect(new Set(hexValues).size).toBe(12);
  });

  it.each(seasons)("provides all three categories for %s", (season) => {
    const palette = getSeasonalPalette(season);
    const categories = palette.colors.map((color) => color.category);

    expect(categories.filter((category) => category === "neutral")).toHaveLength(4);
    expect(categories.filter((category) => category === "accent")).toHaveLength(4);
    expect(categories.filter((category) => category === "statement")).toHaveLength(4);
  });

  it("provides a name for every color", () => {
    const palettes = getAllSeasonalPalettes();

    for (const palette of palettes) {
      for (const color of palette.colors) {
        expect(color.name.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("returns independent copies of palette data", () => {
    const first = getSeasonalPalette("spring");
    first.colors[0].name = "Modified";

    const second = getSeasonalPalette("spring");

    expect(second.colors[0].name).toBe("Ivory");
  });
});
