import { describe, expect, it } from "vitest";
import { isOlderStripeSubscriptionEvent } from "./subscription-order";

describe("Stripe subscription event ordering", () => {
  it("accepts a subscription created after the stored subscription", () => {
    expect(isOlderStripeSubscriptionEvent(1_800_000_002, 1_800_000_001)).toBe(false);
  });

  it("rejects an event for a subscription created before the stored subscription", () => {
    expect(isOlderStripeSubscriptionEvent(1_800_000_000, 1_800_000_001)).toBe(true);
  });

  it("preserves the stored subscription when creation timestamps tie", () => {
    expect(isOlderStripeSubscriptionEvent(1_800_000_001, 1_800_000_001)).toBe(true);
  });

  it("fails closed when either Stripe creation timestamp is invalid", () => {
    expect(() => isOlderStripeSubscriptionEvent(0, 1_800_000_001)).toThrow();
    expect(() => isOlderStripeSubscriptionEvent(Number.NaN, 1_800_000_001)).toThrow();
    expect(() => isOlderStripeSubscriptionEvent(1_800_000_002, Number.POSITIVE_INFINITY)).toThrow();
  });
});
