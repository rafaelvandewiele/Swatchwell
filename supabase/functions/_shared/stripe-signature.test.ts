import { describe, expect, it } from "vitest";
import { constantTimeHexEqual, verifyStripeSignature } from "./stripe-signature";

const now = 1_800_000_000_000;
const timestamp = String(now / 1000);
const secret = "whsec_test_secret";
const payload = JSON.stringify({ id: "evt_test", type: "invoice.paid" });

async function signatureFor(value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(timestamp + "." + value),
  );
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

describe("Stripe webhook signature verification", () => {
  it("accepts a valid v1 signature", async () => {
    const signature = await signatureFor(payload);
    await expect(
      verifyStripeSignature(payload, `t=${timestamp},v1=${signature}`, secret, now),
    ).resolves.toBe(true);
  });

  it("accepts a matching signature among multiple v1 signatures", async () => {
    const signature = await signatureFor(payload);
    await expect(
      verifyStripeSignature(
        payload,
        `t=${timestamp},v1=${"0".repeat(64)},v1=${signature}`,
        secret,
        now,
      ),
    ).resolves.toBe(true);
  });

  it("rejects a modified payload", async () => {
    const signature = await signatureFor(payload);
    await expect(
      verifyStripeSignature(payload + " ", `t=${timestamp},v1=${signature}`, secret, now),
    ).resolves.toBe(false);
  });

  it("rejects a signature outside the five-minute tolerance", async () => {
    const signature = await signatureFor(payload);
    await expect(
      verifyStripeSignature(
        payload,
        `t=${timestamp},v1=${signature}`,
        secret,
        now + 301_000,
      ),
    ).resolves.toBe(false);
  });

  it("rejects malformed headers and malformed signature values", async () => {
    await expect(verifyStripeSignature(payload, "v1=bad", secret, now)).resolves.toBe(false);
    await expect(
      verifyStripeSignature(payload, `t=${timestamp},v1=not-hex`, secret, now),
    ).resolves.toBe(false);
  });

  it("compares valid hexadecimal signatures without case sensitivity", () => {
    const value = "a".repeat(64);
    expect(constantTimeHexEqual(value, value.toUpperCase())).toBe(true);
    expect(constantTimeHexEqual(value, "b".repeat(64))).toBe(false);
    expect(constantTimeHexEqual("invalid", value)).toBe(false);
  });
});
