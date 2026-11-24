import { describe, expect, it } from "vitest";
import { findReusableSubscriptionCheckoutUrl } from "./checkout-session";

const now = Date.parse("2026-11-24T18:00:00.000Z");
const valid = {
  id: "cs_test_123",
  url: "https://checkout.stripe.com/c/pay/cs_test_123",
  status: "open",
  mode: "subscription",
  client_reference_id: "user-123",
  metadata: { user_id: "user-123" },
  expires_at: Math.floor(now / 1000) + 1800,
  customer: "cus_123",
};

describe("reusable subscription checkout session", () => {
  it("reuses a valid open session belonging to the signed-in user", () => {
    expect(findReusableSubscriptionCheckoutUrl([valid], "user-123", "cus_123", now)).toBe(valid.url);
  });

  it("ignores sessions belonging to another user", () => {
    expect(findReusableSubscriptionCheckoutUrl([valid], "user-456", "cus_123", now)).toBeNull();
  });

  it("ignores completed, expired, and non-subscription sessions", () => {
    expect(findReusableSubscriptionCheckoutUrl([
      { ...valid, status: "complete" },
      { ...valid, expires_at: Math.floor(now / 1000) },
      { ...valid, mode: "payment" },
    ], "user-123", "cus_123", now)).toBeNull();
  });

  it("ignores unsafe or malformed checkout URLs", () => {
    expect(findReusableSubscriptionCheckoutUrl([
      { ...valid, url: "http://checkout.stripe.com/session" },
      { ...valid, url: "https://example.com/session" },
      { ...valid, url: "https://user:pass@checkout.stripe.com/c/pay/cs_test_123" },
      { ...valid, url: "https://checkout.stripe.com:444/c/pay/cs_test_123" },
      { ...valid, url: "not a URL" },
    ], "user-123", "cus_123", now)).toBeNull();
  });

  it("handles invalid input safely", () => {
    expect(findReusableSubscriptionCheckoutUrl(null, "user-123", "cus_123", now)).toBeNull();
    expect(findReusableSubscriptionCheckoutUrl([valid], " ", "cus_123", now)).toBeNull();
    expect(findReusableSubscriptionCheckoutUrl([valid], "user-123", " ", now)).toBeNull();
    expect(findReusableSubscriptionCheckoutUrl([valid], "user-123", "cus_123", Number.NaN)).toBeNull();
  });

  it("rejects conflicting user metadata and a different Stripe customer", () => {
    expect(findReusableSubscriptionCheckoutUrl([
      { ...valid, client_reference_id: "user-456", metadata: { user_id: "user-123" } },
      { ...valid, customer: "cus_other" },
    ], "user-123", "cus_123", now)).toBeNull();
  });
});
