import { describe, expect, it } from "vitest";
import { applyStyleProfile, DEFAULT_STYLE_PROFILE, getStyleProfileFit, normalizeStyleProfile, type StyleProfile } from "./profiles";

const profile: StyleProfile = { ...DEFAULT_STYLE_PROFILE, id: "default", formality: "Smart", preferred_colours: ["#000000"] };
const outfit = (id: string, color: string, category = "shirt") => ({ id, items: [{ id: "item-" + id, category, color }] });

describe("style profiles", () => {
  it("normalizes untrusted profile data and rejects invalid records", () => {
    expect(normalizeStyleProfile({ id: "x", name: "  Work  ", preferred_colours: ["red", "#000000"] })?.name).toBe("Work");
    expect(normalizeStyleProfile({ name: "missing id" })).toBeNull();
  });

  it("ranks preferred colours and categories deterministically", () => {
    expect(getStyleProfileFit(outfit("black", "#000000"), profile)).toBeGreaterThan(getStyleProfileFit(outfit("blue", "#ffffff"), profile));
  });

  it("excludes only explicitly excluded owned items", () => {
    const excluded = { ...profile, excluded_item_ids: ["item-a"] };
    expect(applyStyleProfile([outfit("a", "#000000"), outfit("b", "#ffffff")], excluded).map((entry) => entry.id)).toEqual(["b"]);
  });

  it("keeps all outfits when no items are excluded", () => {
    expect(applyStyleProfile([outfit("a", "#000000"), outfit("b", "#ffffff")], profile)).toHaveLength(2);
  });
});
