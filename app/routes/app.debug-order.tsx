import { authenticate } from "../shopify.server";
import type { LoaderFunctionArgs } from "react-router";

/**
 * Debug route to check shipping method data for a specific order
 * Visit: /app/debug-order?orderId=1013
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const { admin } = await authenticate.admin(request);
  
  const url = new URL(request.url);
  const orderNumber = url.searchParams.get("orderId") || "1013";

  console.log(`🔍 DEBUG: Fetching order #${orderNumber}...`);

  const query = `
    query GetOrder($query: String!) {
      orders(first: 1, query: $query) {
        edges {
          node {
            id
            name
            tags
            shippingLine {
              title
              code
            }
            metafields(namespace: "ink", first: 10) {
              edges {
                node {
                  key
                  value
                }
              }
            }
          }
        }
      }
    }
  `;

  const response = await admin.graphql(query, {
    variables: {
      query: `name:#${orderNumber}`
    }
  });

  const data = await response.json();
  const order = data.data?.orders?.edges?.[0]?.node;

  if (!order) {
    return new Response(
      JSON.stringify({ error: `Order #${orderNumber} not found` }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  console.log(`\n📦 Order #${order.name}:`);
  console.log(`  Tags: ${order.tags?.join(", ") || "none"}`);
  console.log(`  Shipping: ${order.shippingLine?.title || "none"}`);
  console.log(`  Shipping Code: ${order.shippingLine?.code || "none"}`);
  

  const metafields: any = {};
  order.metafields?.edges?.forEach((edge: any) => {
    metafields[edge.node.key] = edge.node.value;
  });

  const debugInfo = {
    orderName: order.name,
    orderId: order.id,
    tags: order.tags || [],
    shippingLine: order.shippingLine,
    inkMetafields: metafields,
    hasInkTag: order.tags?.includes("INK-Premium-Delivery"),
    shippingTitle: order.shippingLine?.title || "",
  };

  return new Response(
    `<html>
      <head><title>Order Debug</title></head>
      <body style="font-family: monospace; padding: 20px;">
        <h1>Order ${order.name} Debug Info</h1>
        <h2>Shipping Method:</h2>
        <pre>${JSON.stringify(order.shippingLine, null, 2)}</pre>
        
        <h2>Tags:</h2>
        <pre>${JSON.stringify(order.tags, null, 2)}</pre>
        
        <h2>INK Metafields:</h2>
        <pre>${JSON.stringify(metafields, null, 2)}</pre>
        
        <h2>Analysis:</h2>
        <ul>
          <li>Has INK-Premium-Delivery tag: <strong>${debugInfo.hasInkTag ? "✅ YES" : "❌ NO"}</strong></li>
          <li>Shipping method includes "ink": <strong>${debugInfo.shippingTitle.toLowerCase().includes("ink") ? "✅ YES" : "❌ NO"}</strong></li>
        </ul>
        
        <h2>Full JSON:</h2>
        <pre>${JSON.stringify(debugInfo, null, 2)}</pre>
      </body>
    </html>`,
    {
      headers: { "Content-Type": "text/html" },
    }
  );
}
