// app/utils/webhook-utils.server.ts
import crypto from "crypto";

export function verifyShopifyHmac(rawBody: string, hmacHeader: string, secret: string) {
  const generated = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("base64");

  const a = Buffer.from(generated, "utf8");
  const b = Buffer.from(hmacHeader, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
