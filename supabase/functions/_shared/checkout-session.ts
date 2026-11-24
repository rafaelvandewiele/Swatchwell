export interface ReusableCheckoutSession {
  id: string;
  url: string;
  status: string;
  mode: string;
  client_reference_id?: string | null;
  metadata?: Record<string, unknown> | null;
  expires_at: number;
}

export function findReusableSubscriptionCheckoutUrl(
  sessions: unknown,
  userId: string,
  nowMilliseconds = Date.now(),
): string | null {
  if (!Array.isArray(sessions) || !userId.trim() || !Number.isFinite(nowMilliseconds)) {
    return null;
  }

  const nowSeconds = Math.floor(nowMilliseconds / 1000);
  for (const candidate of sessions) {
    if (!candidate || typeof candidate !== "object") continue;
    const session = candidate as Partial<ReusableCheckoutSession>;
    const belongsToUser =
      session.client_reference_id === userId ||
      session.metadata?.user_id === userId;
    if (
      session.status !== "open" ||
      session.mode !== "subscription" ||
      !belongsToUser ||
      typeof session.url !== "string" ||
      !Number.isFinite(session.expires_at) ||
      (session.expires_at ?? 0) <= nowSeconds
    ) continue;

    try {
      const url = new URL(session.url);
      if (url.protocol === "https:" && url.hostname === "checkout.stripe.com") {
        return session.url;
      }
    } catch {
      // Ignore malformed URLs returned in an unexpected API response.
    }
  }
  return null;
}
