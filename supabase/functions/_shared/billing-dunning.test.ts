import { describe, expect, it } from "vitest";
import {
  dunningCancellationIdempotencyKey,
  dunningReminderIdempotencyKey,
  normalizeDunningLanguage,
  resolveDunningFailureState,
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


  it("starts a failure grace period only once and preserves reminder timestamps", () => {
    const first = resolveDunningFailureState("past_due", null, "2026-11-24T08:00:00.000Z");
    expect(first).toEqual({
      failedAt: "2026-11-24T08:00:00.000Z",
      lastDunningEmailAt: null,
    });
    const repeated = resolveDunningFailureState("unpaid", {
      status: "past_due",
      failed_at: "2026-11-20T08:00:00.000Z",
      last_dunning_email_at: "2026-11-23T08:00:00.000Z",
    }, "2026-11-24T08:00:00.000Z");
    expect(repeated).toEqual({
      failedAt: "2026-11-20T08:00:00.000Z",
      lastDunningEmailAt: "2026-11-23T08:00:00.000Z",
    });
  });

  it("marks a cancellation notice pending after a failed-payment cancellation", () => {
    expect(resolveDunningFailureState("canceled", {
      status: "past_due",
      failed_at: "2026-11-20T08:00:00.000Z",
      last_dunning_email_at: "2026-11-23T08:00:00.000Z",
    }, "2026-11-24T08:00:00.000Z")).toEqual({
      failedAt: "2026-11-20T08:00:00.000Z",
      lastDunningEmailAt: null,
    });
  });

  it("preserves a sent cancellation-notice marker across duplicate deletion events", () => {
    expect(resolveDunningFailureState("canceled", {
      status: "canceled",
      failed_at: "2026-11-20T08:00:00.000Z",
      last_dunning_email_at: "2026-11-24T08:00:00.000Z",
    }, "2026-11-25T08:00:00.000Z")).toEqual({
      failedAt: "2026-11-20T08:00:00.000Z",
      lastDunningEmailAt: "2026-11-24T08:00:00.000Z",
    });
  });

  it("starts a fresh grace period for a different subscription", () => {
    expect(resolveDunningFailureState("past_due", {
      stripe_subscription_id: "sub_old",
      status: "canceled",
      failed_at: "2026-11-10T08:00:00.000Z",
      last_dunning_email_at: "2026-11-10T09:00:00.000Z",
    }, "2026-11-24T08:00:00.000Z", "sub_new")).toEqual({
      failedAt: "2026-11-24T08:00:00.000Z",
      lastDunningEmailAt: null,
    });
  });

  it("clears dunning state after recovery or a cancellation unrelated to payment failure", () => {
    expect(resolveDunningFailureState("active", {
      status: "past_due",
      failed_at: "2026-11-20T08:00:00.000Z",
      last_dunning_email_at: "2026-11-23T08:00:00.000Z",
    }, "2026-11-24T08:00:00.000Z")).toEqual({
      failedAt: null,
      lastDunningEmailAt: null,
    });
    expect(resolveDunningFailureState("canceled", {
      status: "active",
      failed_at: null,
      last_dunning_email_at: null,
    }, "2026-11-24T08:00:00.000Z")).toEqual({
      failedAt: null,
      lastDunningEmailAt: null,
    });
  });

  it("rejects empty IDs and invalid reminder timestamps", () => {
    expect(() => dunningCancellationIdempotencyKey(" ")).toThrow();
    expect(() => dunningReminderIdempotencyKey("", new Date())).toThrow();
    expect(() => dunningReminderIdempotencyKey("sub_123", new Date("invalid"))).toThrow();
  });
});
