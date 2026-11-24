export function isOlderStripeSubscriptionEvent(
  currentCreated: number,
  previousCreated: number,
): boolean {
  if (
    !Number.isSafeInteger(currentCreated) ||
    !Number.isSafeInteger(previousCreated) ||
    currentCreated <= 0 ||
    previousCreated <= 0
  ) {
    throw new Error("Stripe subscription creation timestamps are invalid.");
  }

  // Stripe timestamps have second-level precision. On a tie, preserve the
  // already-persisted subscription rather than allowing an ambiguous event
  // to replace it.
  return currentCreated <= previousCreated;
}
