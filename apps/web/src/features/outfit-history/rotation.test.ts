import { describe, expect, it } from "vitest";
import { filterRecentOutfits, isGarmentAvailable, isWithinRepeatWindow, outfitSignature, sortWearHistory } from "./rotation";
describe("outfit rotation", () => {
  it("excludes unavailable garments unless explicitly overridden", () => {
    expect(isGarmentAvailable("laundry")).toBe(false);
    expect(isGarmentAvailable("repair")).toBe(false);
    expect(isGarmentAvailable("unavailable", true)).toBe(true);
    expect(isGarmentAvailable(undefined)).toBe(true);
  });
  it("creates order-independent outfit signatures", () => {
    expect(outfitSignature(["b","a","b"])).toBe("a|b");
  });
  it("honours configurable repeat windows and disabled rotation", () => {
    expect(isWithinRepeatWindow("2026-11-10","2026-11-16",7)).toBe(true);
    expect(isWithinRepeatWindow("2026-11-10","2026-11-17",7)).toBe(false);
    expect(isWithinRepeatWindow("2026-11-10","2026-11-11",0)).toBe(false);
  });
  it("filters by repeat window and sorts history newest first", () => {
    const entries = [{item_ids:["a"],worn_on:"2026-11-10"},{item_ids:["b"],worn_on:"2026-11-18"}];
    expect(filterRecentOutfits(entries,"2026-11-20",7)).toHaveLength(1);
    expect(sortWearHistory(entries)[0].worn_on).toBe("2026-11-18");
  });
});
