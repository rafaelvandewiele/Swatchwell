export function shouldClaimLegacyStyleData(state: string | null, userId: string): boolean {
  if (!userId.trim()) return false;
  return state === null || state === `in-progress:${userId}`;
}

export function shouldFinalizeLegacyStyleData(state: string | null, userId: string): boolean {
  if (!userId.trim()) return false;
  return state === null || state === "done" || state === `in-progress:${userId}`;
}
