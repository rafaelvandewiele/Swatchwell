import { describe, expect, it } from "vitest";
import { isBlockingSubscriptionStatus } from "./billing-subscription";

describe("blocking Stripe subscription statuses", () => {
  it.each(["active", "trialing", "past_due", "unpaid", "incomplete", "paused"])(
    "blocks a new checkout for %s subscriptions",
    (status) => {
      expect(isBlockingSubscriptionStatus(status)).toBe(true);
    },
  );

  it.each(["canceled", "incomplete_expired", "ended", null, undefined, 42])(
    "does not block a new checkout for terminal or invalid status %s",
    (status) => {
      expect(isBlockingSubscriptionStatus(status)).toBe(false);
    },
  );
});
