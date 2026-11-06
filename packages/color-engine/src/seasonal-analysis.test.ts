import { describe, expect, it } from "vitest";
import {
  analyzeSeasonalProfile,
  type SeasonalProfile,
} from "./seasonal-analysis";

describe("Twelve-season color analysis", () => {
  const cases: Array<{
    name: string;
    profile: SeasonalProfile;
    expected: string;
  }> = [
    {
      name: "Light Spring",
      profile: { undertone: "warm", value: "light", chroma: "clear", contrast: "low" },
      expected: "light-spring",
    },
    {
      name: "True Spring",
      profile: { undertone: "warm", value: "balanced", chroma: "clear", contrast: "medium" },
      expected: "true-spring",
    },
    {
      name: "Bright Spring",
      profile: { undertone: "neutral", value: "light", chroma: "clear", contrast: "high" },
      expected: "bright-spring",
    },
    {
      name: "Light Summer",
      profile: { undertone: "cool", value: "light", chroma: "soft", contrast: "low" },
      expected: "light-summer",
    },
    {
      name: "True Summer",
      profile: { undertone: "cool", value: "balanced", chroma: "soft", contrast: "medium" },
      expected: "true-summer",
    },
    {
      name: "Soft Summer",
      profile: { undertone: "neutral", value: "balanced", chroma: "soft", contrast: "low" },
      expected: "soft-summer",
    },
    {
      name: "Soft Autumn",
      profile: { undertone: "warm", value: "balanced", chroma: "soft", contrast: "low" },
      expected: "soft-autumn",
    },
    {
      name: "True Autumn",
      profile: { undertone: "warm", value: "balanced", chroma: "soft", contrast: "medium" },
      expected: "true-autumn",
    },
    {
      name: "Deep Autumn",
      profile: { undertone: "warm", value: "deep", chroma: "soft", contrast: "high" },
      expected: "deep-autumn",
    },
    {
      name: "Deep Winter",
      profile: { undertone: "cool", value: "deep", chroma: "clear", contrast: "high" },
      expected: "deep-winter",
    },
    {
      name: "True Winter",
      profile: { undertone: "cool", value: "balanced", chroma: "clear", contrast: "medium" },
      expected: "true-winter",
    },
    {
      name: "Bright Winter",
      profile: { undertone: "cool", value: "light", chroma: "clear", contrast: "high" },
      expected: "bright-winter",
    },
  ];

  it.each(cases)("returns a result for $name", ({ profile, expected }) => {
    const result = analyzeSeasonalProfile(profile);
    expect(result.subSeason).toBe(expected);
    expect(result.season).toBeTruthy();
  });

  it("always returns a profile when every answer is uncertain", () => {
    const result = analyzeSeasonalProfile({
      undertone: "uncertain",
      value: "uncertain",
      chroma: "uncertain",
      contrast: "uncertain",
    });

    expect(result.subSeason).toBe("soft-summer");
    expect(result.season).toBe("summer");
    expect(result.confidence).toBe("low");
    expect(result.status).toBe("needs_review");
  });

  it("returns a profile for neutral and mixed characteristics", () => {
    const result = analyzeSeasonalProfile({
      undertone: "neutral",
      value: "light",
      chroma: "soft",
      contrast: "low",
    });

    expect(result.subSeason).toBeTruthy();
    expect(result.season).toBeTruthy();
  });

  it("returns a result when only one answer is known", () => {
    const result = analyzeSeasonalProfile({
      undertone: "warm",
      value: "uncertain",
      chroma: "uncertain",
      contrast: "uncertain",
    });

    expect(result.subSeason).toBeTruthy();
    expect(result.confidence).toBe("low");
  });

  it("rejects invalid profile values", () => {
    expect(() =>
      analyzeSeasonalProfile({
        undertone: "invalid" as never,
        value: "light",
        chroma: "clear",
        contrast: "medium",
      }),
    ).toThrow(RangeError);
  });
});
