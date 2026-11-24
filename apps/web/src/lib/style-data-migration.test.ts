import { describe, expect, it } from "vitest";
import {
  shouldClaimLegacyStyleData,
  shouldFinalizeLegacyStyleData,
} from "./style-data-migration";

describe("legacy style-data migration ownership", () => {
  it("lets the first account claim unowned legacy browser data", () => {
    expect(shouldClaimLegacyStyleData(null, "user-a")).toBe(true);
    expect(shouldFinalizeLegacyStyleData(null, "user-a")).toBe(true);
  });

  it("lets the original account resume its interrupted migration", () => {
    expect(shouldClaimLegacyStyleData("in-progress:user-a", "user-a")).toBe(true);
    expect(shouldFinalizeLegacyStyleData("in-progress:user-a", "user-a")).toBe(true);
  });

  it("prevents another account from claiming or finalizing an in-progress migration", () => {
    expect(shouldClaimLegacyStyleData("in-progress:user-a", "user-b")).toBe(false);
    expect(shouldFinalizeLegacyStyleData("in-progress:user-a", "user-b")).toBe(false);
  });

  it("does not let a signed-in account reclaim completed legacy data", () => {
    expect(shouldClaimLegacyStyleData("done", "user-a")).toBe(false);
    expect(shouldFinalizeLegacyStyleData("done", "user-a")).toBe(true);
  });

  it("rejects empty user identifiers", () => {
    expect(shouldClaimLegacyStyleData(null, " ")).toBe(false);
    expect(shouldFinalizeLegacyStyleData(null, " ")).toBe(false);
  });
});
