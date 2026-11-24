import { describe, expect, it } from "vitest";
import {
  dunningCancellationIdempotencyKey,
  dunningReminderIdempotencyKey,
  normalizeDunningLanguage,
} from "./billing-dunning";

describe("billing dunning helpers", () => {
  it("normalizes supported languages and safely falls back for null or unknown values", () => {
    expect(normalizeDunningLanguage("nl")).toBe("nl");
    expect(normalizeDunningLanguage("fr")).toBe("fr");
    expect(normalizeDunningLanguage("de")).toBe("de");
    expect(normalizeDunningLanguage("en")).toBe("en");
    expect(normalizeDunningLanguage(null)).toBe("en");
    expect(normalizeDunningLanguage(undefined)).toBe("en");
    expect(normalizeDunningLanguage("es")).toBe("en");
  });

  it("uses a stable per-subscription, per-UTC-day reminder key", () => {
    const morning = new Date("2026-11-24T08:17:00.000Z");
    const later = new Date("2026-11-24T18:45:00.000Z");
    expect(dunningReminderIdempotencyKey("sub_123", morning))
      .toBe("swatchwell-dunning-reminder/sub_123/2026-11-24");
    expect(dunningReminderIdempotencyKey("sub_123", later))
      .toBe(dunningReminderIdempotencyKey("sub_123", morning));
    expect(dunningReminderIdempotencyKey("sub_456", morning))
      .not.toBe(dunningReminderIdempotencyKey("sub_123", morning));
    expect(dunningReminderIdempotencyKey("sub_123", new Date("2026-11-25T00:00:00.000Z")))
      .not.toBe(dunningReminderIdempotencyKey("sub_123", morning));
  });

  it("uses one stable cancellation-notification key per subscription", () => {
    expect(dunningCancellationIdempotencyKey("sub_123"))
      .toBe("swatchwell-dunning-cancelled/sub_123");
    expect(dunningCancellationIdempotencyKey("sub_456"))
      .not.toBe(dunningCancellationIdempotencyKey("sub_123"));
  });

  it("rejects empty IDs and invalid reminder timestamps", () => {
    expect(() => dunningCancellationIdempotencyKey(" ")).toThrow();
    expect(() => dunningReminderIdempotencyKey("", new Date())).toThrow();
    expect(() => dunningReminderIdempotencyKey("sub_123", new Date("invalid"))).toThrow();
  });
});
