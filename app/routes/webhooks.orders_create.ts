import type { ActionFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { verifyShopifyHmac } from "~/utils/webhook-utils.server";

export const action: ActionFunction = async ({ request }) => {
  const rawBody = await request.text(); // get raw body
  const shopifyHmac = request.headers.get("x-shopify-hmac-sha256") || "";
  const topic = request.headers.get("x-shopify-topic") || "";
  const shop = request.headers.get("x-shopify-shop-domain") || "";

  // Verify authenticity
  const valid = verifyShopifyHmac(rawBody, shopifyHmac, process.env.SHOPIFY_API_SECRET!);
  if (!valid) {
    console.error("Invalid HMAC for webhook", topic);
    return new Response("Invalid HMAC", { status: 401 });
  }

  // Parse webhook payload
  const data = JSON.parse(rawBody);
  console.log("✅ Webhook received:", topic, "for shop", shop, "Order ID:", data.id);

  // TODO: store webhook data or trigger async job
  return json({ ok: true });
};
