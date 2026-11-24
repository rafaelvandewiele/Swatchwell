export function constantTimeHexEqual(left: string, right: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) return false;

  let difference = 0;
  for (let index = 0; index < 64; index++) {
    difference |= left.toLowerCase().charCodeAt(index) ^ right.toLowerCase().charCodeAt(index);
  }
  return difference === 0;
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function verifyStripeSignature(
  payload: string,
  header: string,
  secret: string,
  nowMs = Date.now(),
): Promise<boolean> {
  const fields = header.split(",").map((part) => {
    const separator = part.indexOf("=");
    return separator < 0
      ? ["", ""]
      : [part.slice(0, separator).trim(), part.slice(separator + 1).trim()];
  });
  const timestamp = fields.find(([key]) => key === "t")?.[1];
  const signatures = fields.filter(([key]) => key === "v1").map(([, value]) => value);
  const timestampNumber = Number(timestamp);

  if (
    !timestamp ||
    !Number.isSafeInteger(timestampNumber) ||
    !signatures.length ||
    Math.abs(nowMs / 1000 - timestampNumber) > 300
  ) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = toHex(new Uint8Array(await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(timestamp + "." + payload),
  )));

  let valid = false;
  for (const signature of signatures) {
    valid = constantTimeHexEqual(expected, signature) || valid;
  }
  return valid;
}
