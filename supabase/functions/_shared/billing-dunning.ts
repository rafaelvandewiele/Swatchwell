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
