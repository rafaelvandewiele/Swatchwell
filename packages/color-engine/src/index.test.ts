import { describe, expect, it } from "vitest";
import { deltaE2000, rgbToLab } from "./index";
import {
  contrastRatio,
  hexToRgb,
  hslToRgb,
  isValidHex,
  normalizeHex,
  relativeLuminance,
  rgbDistance,
  rgbToHex,
  rgbToHsl,
} from "./index";

describe("HEX colors", () => {
  it("validates supported HEX formats", () => {
    expect(isValidHex("#fff")).toBe(true);
    expect(isValidHex("#FFFFFF")).toBe(true);
    expect(isValidHex("ffffff")).toBe(false);
    expect(isValidHex("#ffff")).toBe(false);
  });

  it("normalizes shorthand and uppercase HEX", () => {
    expect(normalizeHex("#ABC")).toBe("#aabbcc");
    expect(normalizeHex("#FFFFFF")).toBe("#ffffff");
  });

  it("converts HEX to RGB", () => {
    expect(hexToRgb("#ff8000")).toEqual({ r: 255, g: 128, b: 0 });
  });

  it("rejects invalid HEX", () => {
    expect(() => hexToRgb("not-a-color")).toThrow();
  });
});

describe("RGB and HSL conversion", () => {
  it("converts RGB to HEX", () => {
    expect(rgbToHex({ r: 255, g: 128, b: 0 })).toBe("#ff8000");
  });

  it("converts primary colors from RGB to HSL", () => {
    expect(rgbToHsl({ r: 255, g: 0, b: 0 })).toEqual({
      h: 0,
      s: 100,
      l: 50,
    });
  });

  it("converts HSL to RGB", () => {
    expect(hslToRgb({ h: 0, s: 100, l: 50 })).toEqual({
      r: 255,
      g: 0,
      b: 0,
    });
  });

  it("handles grayscale colors", () => {
    expect(rgbToHsl({ r: 128, g: 128, b: 128 })).toEqual({
      h: 0,
      s: 0,
      l: (128 / 255) * 100,
    });
  });

  it("rejects out-of-range RGB values", () => {
    expect(() => rgbToHex({ r: 256, g: 0, b: 0 })).toThrow(RangeError);
  });

  it("rejects invalid HSL saturation", () => {
    expect(() => hslToRgb({ h: 0, s: 120, l: 50 })).toThrow(RangeError);
  });
});

describe("Color calculations", () => {
  it("calculates black and white luminance", () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBe(0);
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBe(1);
  });

  it("calculates the black and white contrast ratio", () => {
    expect(contrastRatio(
      { r: 0, g: 0, b: 0 },
      { r: 255, g: 255, b: 255 },
    )).toBeCloseTo(21, 5);
  });

  it("returns zero distance for identical colors", () => {
    const color = { r: 120, g: 80, b: 40 };
    expect(rgbDistance(color, color)).toBe(0);
  });
});

describe("CIE Lab and Delta E 2000", () => {
  it("converts white RGB to Lab", () => {
    const result = rgbToLab({ r: 255, g: 255, b: 255 });

    expect(result.l).toBeCloseTo(100, 2);
    expect(result.a).toBeCloseTo(0, 2);
    expect(result.b).toBeCloseTo(0, 2);
  });

  it("converts black RGB to Lab", () => {
    const result = rgbToLab({ r: 0, g: 0, b: 0 });

    expect(result.l).toBeCloseTo(0, 5);
    expect(result.a).toBeCloseTo(0, 5);
    expect(result.b).toBeCloseTo(0, 5);
  });

  it("returns zero for identical Lab colors", () => {
    const color = { l: 50, a: 20, b: 30 };

    expect(deltaE2000(color, color)).toBeCloseTo(0, 10);
  });

  it("matches a published Delta E 2000 reference pair", () => {
    const first = { l: 50, a: 2.6772, b: -79.7751 };
    const second = { l: 50, a: 0, b: -82.7485 };

    expect(deltaE2000(first, second)).toBeCloseTo(2.0425, 4);
  });

  it("rejects non-finite Lab values", () => {
    expect(() =>
      deltaE2000(
        { l: Number.NaN, a: 0, b: 0 },
        { l: 50, a: 0, b: 0 },
      ),
    ).toThrow(RangeError);
  });
});
