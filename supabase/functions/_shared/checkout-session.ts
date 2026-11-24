export interface ReusableCheckoutSession {
  id: string;
  url: string;
  status: string;
  mode: string;
  client_reference_id?: string | null;
  metadata?: Record<string, unknown> | null;
  customer?: string | { id?: string } | null;
  expires_at: number;
}

export function findReusableSubscriptionCheckoutUrl(
  sessions: unknown,
  userId: string,
  expectedCustomerId: string,
  nowMilliseconds = Date.now(),
): string | null {
  if (!Array.isArray(sessions) || !userId.trim() || !expectedCustomerId.trim() || !Number.isFinite(nowMilliseconds)) {
    return null;
  }

  const nowSeconds = Math.floor(nowMilliseconds / 1000);
  for (const candidate of sessions) {
    if (!candidate || typeof candidate !== "object") continue;
    const session = candidate as Partial<ReusableCheckoutSession>;
    const clientReferenceId = session.client_reference_id;
    const metadataUserId = typeof session.metadata?.user_id === "string"
      ? session.metadata.user_id
      : null;
    const customerId = typeof session.customer === "string"
      ? session.customer
      : session.customer?.id;
    const belongsToUser =
      (clientReferenceId === userId || metadataUserId === userId) &&
      (!clientReferenceId || clientReferenceId === userId) &&
      (!metadataUserId || metadataUserId === userId);
    if (
      session.status !== "open" ||
      session.mode !== "subscription" ||
      customerId !== expectedCustomerId ||
      !belongsToUser ||
      typeof session.url !== "string" ||
      !Number.isFinite(session.expires_at) ||
      (session.expires_at ?? 0) <= nowSeconds
    ) continue;

    try {
      const url = new URL(session.url);
      if (url.origin === "https://checkout.stripe.com" && !url.username && !url.password) {
        return session.url;
      }
    } catch {
      // Ignore malformed URLs returned in an unexpected API response.
    }
  }
  return null;
}
