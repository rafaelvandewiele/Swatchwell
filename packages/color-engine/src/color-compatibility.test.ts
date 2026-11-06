import { describe, expect, it } from "vitest";
import { calculateColorCompatibility } from "./color-compatibility";

describe("Color compatibility", () => {
  it("returns a complete compatibility result", () => {
    const result = calculateColorCompatibility("#F5EBD5", "spring");

    expect(result.garmentColor).toBe("#f5ebd5");
    expect(result.season).toBe("spring");
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.deltaE).toBeGreaterThanOrEqual(0);
    expect(result.closestMatch.name).toBe("Ivory");
    expect(result.explanation.length).toBeGreaterThan(0);
  });

  it("recognizes an exact palette color", () => {
    const result = calculateColorCompatibility("#F5EBD5", "spring");

    expect(result.deltaE).toBeCloseTo(0, 5);
    expect(result.score).toBe(100);
    expect(result.rating).toBe("excellent");
  });

  it.each(["spring", "summer", "autumn", "winter"] as const)(
    "supports the %s season",
    (season) => {
      const result = calculateColorCompatibility("#336699", season);

      expect(result.season).toBe(season);
      expect(result.closestMatch.hex).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    },
  );

  it("normalizes short HEX colors", () => {
    const result = calculateColorCompatibility("#fff", "winter");

    expect(result.garmentColor).toBe("#ffffff");
  });

  it("returns a deterministic result", () => {
    const first = calculateColorCompatibility("#336699", "summer");
    const second = calculateColorCompatibility("#336699", "summer");

    expect(first).toEqual(second);
  });

  it("rejects invalid HEX colors", () => {
    expect(() =>
      calculateColorCompatibility("not-a-color", "spring"),
    ).toThrow();
  });

  it("does not mutate the seasonal palette", () => {
    const first = calculateColorCompatibility("#F5EBD5", "spring");
    first.closestMatch.name = "Changed";

    const second = calculateColorCompatibility("#F5EBD5", "spring");

    expect(second.closestMatch.name).toBe("Ivory");
  });
});
