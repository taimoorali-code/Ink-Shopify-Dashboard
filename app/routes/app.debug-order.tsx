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
    `<!DOCTYPE html>
      <html>
      <head>
        <title>Order Debug - ink.</title>
        <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&display=swap" rel="stylesheet">
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #ffffff;
            color: #000000;
            line-height: 1.6;
          }
          .hero {
            background: #000000;
            color: #ffffff;
            padding: 64px 32px;
            text-align: center;
          }
          .hero h1 {
            font-family: 'Playfair Display', serif;
            font-size: 40px;
            font-weight: 600;
            margin: 0 0 8px 0;
            letter-spacing: -0.01em;
          }
          .hero p {
            font-size: 14px;
            color: rgba(255,255,255,0.7);
          }
          .container {
            max-width: 1000px;
            margin: 0 auto;
            padding: 48px 32px;
          }
          .section {
            background: #F9F9F9;
            border: 1px solid #E5E5E5;
            border-radius: 8px;
            padding: 32px;
            margin-bottom: 24px;
          }
          h2 {
            font-family: 'Playfair Display', serif;
            font-size: 24px;
            font-weight: 600;
            margin: 0 0 16px 0;
          }
          pre {
            background: #ffffff;
            border: 1px solid #E5E5E5;
            border-radius: 4px;
            padding: 16px;
            overflow-x: auto;
            font-size: 13px;
            line-height: 1.5;
          }
          ul {
            list-style: none;
            padding: 0;
          }
          li {
            padding: 12px 0;
            border-bottom: 1px solid #E5E5E5;
            font-size: 14px;
          }
          li:last-child { border-bottom: none; }
          strong { font-weight: 600; }
          .brand {
            font-family: 'Playfair Display', serif;
            font-size: 24px;
           font-weight: 600;
          }
        </style>
      </head>
      <body>
        <div class="hero">
          <span class="brand">ink.</span>
          <h1>Order Debug Tool</h1>
          <p>Technical debugging information for order ${order.name}</p>
        </div>
        
        <div class="container">
          <div class="section">
            <h2>Shipping Method</h2>
            <pre>${JSON.stringify(order.shippingLine, null, 2)}</pre>
          </div>
          
          <div class="section">
            <h2>Order Tags</h2>
            <pre>${JSON.stringify(order.tags, null, 2)}</pre>
          </div>
          
          <div class="section">
            <h2>INK Metafields</h2>
            <pre>${JSON.stringify(metafields, null, 2)}</pre>
          </div>
          
          <div class="section">
            <h2>Analysis</h2>
            <ul>
              <li>Has INK-Premium-Delivery tag: <strong>${debugInfo.hasInkTag ? "✅ YES" : "❌ NO"}</strong></li>
              <li>Shipping method includes "ink": <strong>${debugInfo.shippingTitle.toLowerCase().includes("ink") ? "✅ YES" : "❌ NO"}</strong></li>
            </ul>
          </div>
          
          <div class="section">
            <h2>Full Debug JSON</h2>
            <pre>${JSON.stringify(debugInfo, null, 2)}</pre>
          </div>
        </div>
      </body>
    </html>`,
    {
      headers: { "Content-Type": "text/html" },
    }
  );
}
