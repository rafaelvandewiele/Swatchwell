const BLOCKING_SUBSCRIPTION_STATUSES = new Set([
  "active",
  "trialing",
  "past_due",
  "unpaid",
  "incomplete",
  "paused",
]);

export function isBlockingSubscriptionStatus(status: unknown): boolean {
  return typeof status === "string" && BLOCKING_SUBSCRIPTION_STATUSES.has(status);
}
