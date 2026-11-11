import { describe, expect, it } from "vitest";
import { COLOUR_CLARITY_SWATCHES } from "./seasonal-questionnaire";

describe("colour clarity visual examples", () => {
  it("provides three muted and three vivid colour samples", () => {
    expect(COLOUR_CLARITY_SWATCHES.soft).toHaveLength(3);
    expect(COLOUR_CLARITY_SWATCHES.clear).toHaveLength(3);
  });

  it("uses valid six-digit hexadecimal colours", () => {
    for (const colour of [...COLOUR_CLARITY_SWATCHES.soft, ...COLOUR_CLARITY_SWATCHES.clear]) {
      expect(colour).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });
});
