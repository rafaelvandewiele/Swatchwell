import { describe, expect, it } from "vitest";
import { analyzeSeasonalProfile } from "./seasonal-analysis";

describe("Seasonal color analysis", () => {
  it("classifies Spring", () => {
    const result = analyzeSeasonalProfile({
      undertone: "warm",
      value: "light",
      chroma: "clear",
      contrast: "medium",
    });

    expect(result.season).toBe("spring");
    expect(result.status).toBe("classified");
  });

  it("classifies Summer", () => {
    const result = analyzeSeasonalProfile({
      undertone: "cool",
      value: "light",
      chroma: "soft",
      contrast: "low",
    });

    expect(result.season).toBe("summer");
  });

  it("classifies Autumn", () => {
    const result = analyzeSeasonalProfile({
      undertone: "warm",
      value: "deep",
      chroma: "soft",
      contrast: "medium",
    });

    expect(result.season).toBe("autumn");
  });

  it("classifies Winter", () => {
    const result = analyzeSeasonalProfile({
      undertone: "cool",
      value: "deep",
      chroma: "clear",
      contrast: "high",
    });

    expect(result.season).toBe("winter");
  });

  it("does not force a classification for neutral undertones", () => {
    const result = analyzeSeasonalProfile({
      undertone: "neutral",
      value: "light",
      chroma: "soft",
      contrast: "low",
    });

    expect(result.season).toBeNull();
    expect(result.status).toBe("needs_review");
  });

  it("does not force a classification for mixed characteristics", () => {
    const result = analyzeSeasonalProfile({
      undertone: "warm",
      value: "light",
      chroma: "soft",
      contrast: "medium",
    });

    expect(result.season).toBeNull();
    expect(result.status).toBe("needs_review");
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
