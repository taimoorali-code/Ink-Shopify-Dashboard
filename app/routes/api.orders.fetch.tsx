import { type LoaderFunctionArgs } from "react-router";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept, X-Requested-With, Origin",
};

// Handle OPTIONS preflight
export const action = async () => {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();

  try {
    // Get offline session (needed for Shopify API calls)
    const session = await prisma.session.findFirst({
      where: { isOnline: false },
    });

    if (!session) {
      await prisma.$disconnect();
      return new Response(
        JSON.stringify({ error: "No session available" }),
        {
          status: 500,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
        }
      );
    }

    // Parse query parameters
    const url = new URL(request.url);
    const searchQuery = url.searchParams.get("search") || "";

    // Create admin client helper for Shopify API calls
    const admin = {
      graphql: async (query: string, options?: any) => {
        const response = await fetch(`https://${session.shop}/admin/api/2024-10/graphql.json`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": session.accessToken,
          },
          body: JSON.stringify({
            query,
            variables: options?.variables || {},
          }),
        });

        return {
          json: async () => await response.json(),
        };
      },
    };

    console.log("📦 Fetching orders for NFC enrollment...");

    // GraphQL query to fetch orders
    const query = `
      query GetOrders {
        orders(first: 50, reverse: true) {
          edges {
            node {
              id
              name
              createdAt
              displayFinancialStatus
              displayFulfillmentStatus
              totalPriceSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
              customer {
                firstName
                lastName
                email
              }
              tags
              metafields(namespace: "ink", first: 10) {
                edges {
                  node {
                    key
                    value
                  }
                }
              }
              lineItems(first: 20) {
                edges {
                  node {
                    title
                    quantity
                    customAttributes {
                      key
                      value
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    const response = await admin.graphql(query);
    const data = await response.json();

    if (!data?.data?.orders) {
      console.error("❌ Failed to fetch orders:", data);
      await prisma.$disconnect();
      return new Response(
        JSON.stringify({ error: "Failed to fetch orders", orders: [] }),
        {
          status: 500,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
        }
      );
    }

    // Process orders
    const allOrders = data.data.orders.edges.map((edge: any) => {
      const order = edge.node;
      const numericId = order.id.replace("gid://shopify/Order/", "");

      // Parse metafields
      const metafields: Record<string, string> = {};
      order.metafields?.edges?.forEach((mfEdge: any) => {
        metafields[mfEdge.node.key] = mfEdge.node.value;
      });

      // Check if order has INK Premium Delivery
      const hasInkTag = order.tags?.includes("INK-Premium-Delivery");
      const hasDeliveryTypeMetafield = metafields.delivery_type === "premium";
      const hasInkMetafield = metafields.ink_premium_order === "true";

      // Check line items for INK products
      let hasInkLineItem = false;
      for (const lineItem of order.lineItems?.edges || []) {
        const title = (lineItem.node?.title || "").toLowerCase();
        if (title.includes("ink delivery") || title.includes("ink protected") || title.includes("ink premium")) {
          hasInkLineItem = true;
          break;
        }
        for (const attr of lineItem.node?.customAttributes || []) {
          if (attr.key === "_ink_premium_fee" && attr.value === "true") {
            hasInkLineItem = true;
            break;
          }
        }
      }

      const isInkOrder = hasInkTag || hasDeliveryTypeMetafield || hasInkMetafield || hasInkLineItem;

      // Get verification status - filter out enrolled or verified
      const verificationStatus = (metafields.verification_status || "pending").toLowerCase();
      const isEligible = isInkOrder && verificationStatus !== "enrolled" && verificationStatus !== "verified";

      // Get line item details
      const items = order.lineItems?.edges?.map((li: any) => ({
        title: li.node.title,
        quantity: li.node.quantity,
      })) || [];

      // Determine shipping status
      let shippingStatus = "STANDARD";
      let shippingColor = "gray";
      
      const fulfillmentStatus = order.displayFulfillmentStatus || "";
      if (fulfillmentStatus.includes("Unfulfilled") || fulfillmentStatus === "") {
        // Calculate time-based shipping urgency
        const createdAt = new Date(order.createdAt);
        const now = new Date();
        const hoursOld = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
        
        if (hoursOld < 24) {
          shippingStatus = "SHIPS TODAY — 2H REMAINING";
          shippingColor = "red";
        } else if (hoursOld < 48) {
          shippingStatus = "SHIPS TOMORROW";
          shippingColor = "orange";
        }
      }

      return {
        id: numericId,
        name: order.name,
        createdAt: order.createdAt,
        items: items,
        itemCount: items.reduce((sum: number, item: any) => sum + item.quantity, 0),
        totalPrice: parseFloat(order.totalPriceSet.shopMoney.amount).toFixed(2),
        currency: order.totalPriceSet.shopMoney.currencyCode,
        currencySymbol: order.totalPriceSet.shopMoney.currencyCode === "USD" ? "$" : order.totalPriceSet.shopMoney.currencyCode,
        shippingStatus,
        shippingColor,
        customerName: order.customer
          ? `${order.customer.firstName} ${order.customer.lastName}`
          : "Guest",
        customerEmail: order.customer?.email || "",
        verificationStatus,
        isEligible,
      };
    });

    // Filter to only eligible orders
    let eligibleOrders = allOrders.filter((order: any) => order.isEligible);

    // Apply search filter if provided
    if (searchQuery) {
      eligibleOrders = eligibleOrders.filter((order: any) => 
        order.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.id.includes(searchQuery) ||
        order.items.some((item: any) => item.title.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    }

    console.log(`✅ Found ${eligibleOrders.length} eligible orders (${allOrders.length} total)`);

    await prisma.$disconnect();

    return new Response(
      JSON.stringify({ 
        success: true,
        orders: eligibleOrders,
        total: eligibleOrders.length 
      }),
      {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
      }
    );

  } catch (error: any) {
    console.error("❌ Error fetching orders:", error);
    await prisma.$disconnect();
    return new Response(
      JSON.stringify({ 
        error: error.message || "Failed to fetch orders",
        orders: [] 
      }),
      {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
      }
    );
  }
};
