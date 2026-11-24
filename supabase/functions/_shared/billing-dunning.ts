export type DunningLanguage = "en" | "nl" | "fr" | "de";

export function normalizeDunningLanguage(language: unknown): DunningLanguage {
  if (typeof language === "string" && ["en", "nl", "fr", "de"].includes(language)) {
    return language as DunningLanguage;
  }
  return "en";
}

export function dunningReminderIdempotencyKey(subscriptionId: string, now: Date): string {
  if (!subscriptionId.trim() || Number.isNaN(now.getTime())) {
    throw new Error("A subscription ID and valid timestamp are required.");
  }
  return "swatchwell-dunning-reminder/" + subscriptionId + "/" + now.toISOString().slice(0, 10);
}

export function dunningCancellationIdempotencyKey(subscriptionId: string): string {
  if (!subscriptionId.trim()) throw new Error("A subscription ID is required.");
  return "swatchwell-dunning-cancelled/" + subscriptionId;
}

export interface PreviousDunningState {
  status?: string | null;
  failed_at?: string | null;
  last_dunning_email_at?: string | null;
}

export function resolveDunningFailureState(
  currentStatus: string,
  previous: PreviousDunningState | null | undefined,
  nowIso: string,
): { failedAt: string | null; lastDunningEmailAt: string | null } {
  if (currentStatus === "past_due" || currentStatus === "unpaid") {
    return {
      failedAt: previous?.failed_at ?? nowIso,
      lastDunningEmailAt: previous?.last_dunning_email_at ?? null,
    };
  }

  const cancelledAfterFailure =
    currentStatus === "canceled" &&
    Boolean(previous?.failed_at) &&
    ["past_due", "unpaid", "canceled"].includes(previous?.status ?? "");

  if (cancelledAfterFailure) {
    return {
      failedAt: previous!.failed_at!,
      // A first cancellation event after a failed-payment state needs a
      // cancellation notice. Duplicate deletion events preserve its marker.
      lastDunningEmailAt: previous?.status === "canceled"
        ? previous.last_dunning_email_at ?? null
        : null,
    };
  }

  return { failedAt: null, lastDunningEmailAt: null };
}
