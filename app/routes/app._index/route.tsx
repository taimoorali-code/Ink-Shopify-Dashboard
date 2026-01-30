import { useState, useEffect } from "react";
import { useLoaderData, Link, useRevalidator } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../../shopify.server";

// Define types for our data
interface Order {
    id: string;
    name: string;
    createdAt: string;
    financialStatus: string;
    fulfillmentStatus: string;
    totalPrice: string;
    currency: string;
    customerName: string;
    customerEmail: string;
    verificationStatus: string;
    nfcUid: string;
    hasProof: boolean;
    proofId: string;
    isInkOrder: boolean; // Add this to interface
    metafields?: any; // Add optional metafields
    tags?: string[]; // Add optional tags
    lineItems?: any; // Add optional lineItems
    totalPriceSet?: any;
    customer?: any;
    displayFinancialStatus?: string;
    displayFulfillmentStatus?: string;
}

interface LoaderData {
    orders: Order[];
}

// Loader: Fetch orders with metafields from Shopify
export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { admin } = await authenticate.admin(request);

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

    try {
        const response = await admin.graphql(query);
        const data = await response.json();

        const allOrders: Order[] = data.data?.orders?.edges?.map((edge: any) => {
            const order = edge.node;
            const numericId = order.id.replace("gid://shopify/Order/", "");

            const metafields: Record<string, string> = {};
            order.metafields?.edges?.forEach((mfEdge: any) => {
                metafields[mfEdge.node.key] = mfEdge.node.value;
            });

            const hasInkTag = order.tags?.includes("INK-Premium-Delivery") || order.tags?.includes("INK-Verified-Delivery");
            const hasDeliveryTypeMetafield = metafields.delivery_type === "premium";
            const hasInkMetafield = metafields.ink_premium_order === "true";

            let hasInkLineItem = false;
            for (const lineItem of order.lineItems?.edges || []) {
                const title = (lineItem.node?.title || "").toLowerCase();
                if (
                    title.includes("ink delivery") || 
                    title.includes("ink protected") || 
                    title.includes("ink premium") ||
                    title.includes("ink verified") ||
                    title.includes("verified delivery")
                ) {
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

            const verificationStatus = metafields.verification_status || "Pending";
            const hasProof = !!metafields.proof_reference;
            const nfcUid = metafields.nfc_uid || "";
            const proofId = metafields.proof_reference || "";

            return {
                id: numericId,
                name: order.name,
                createdAt: order.createdAt,
                financialStatus: order.displayFinancialStatus,
                fulfillmentStatus: order.displayFulfillmentStatus,
                totalPrice: order.totalPriceSet.shopMoney.amount,
                currency: order.totalPriceSet.shopMoney.currencyCode,
                customerName: order.customer
                    ? `${order.customer.firstName} ${order.customer.lastName}`
                    : "Guest",
                customerEmail: order.customer?.email || "",
                verificationStatus,
                nfcUid,
                hasProof,
                proofId,
                isInkOrder,
            };
        }) || [];

        const orders = allOrders.filter((order: any) => order.isInkOrder);

        return { orders };
    } catch (error) {
        console.error("Error fetching orders:", error);
        return { orders: [] };
    }
};

// Helper function to format date
function formatDate(isoDate: string): string {
    const date = new Date(isoDate);
    return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}

export default function DashboardHome() {
    const { orders } = useLoaderData<LoaderData>();
    const revalidator = useRevalidator();
    const [searchTerm, setSearchTerm] = useState("");

    // Auto-refresh dashboard every 30 seconds
    useEffect(() => {
        const interval = setInterval(() => {
            if (revalidator.state === "idle") {
                revalidator.revalidate();
            }
        }, 30000); // 30 seconds

        return () => clearInterval(interval);
    }, [revalidator]);

    // Filter orders based on search
    const filteredOrders = orders.filter((order: Order) =>
        order.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.customerName.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Calculate stats
    const verifiedCount = orders.filter((o: Order) => o.verificationStatus.toLowerCase() === "verified").length;
    const enrolledCount = orders.filter((o: Order) => o.verificationStatus.toLowerCase() === "enrolled").length;
    const pendingCount = orders.filter((o: Order) => 
        o.verificationStatus.toLowerCase() !== "verified" && 
        o.verificationStatus.toLowerCase() !== "enrolled"
    ).length;

    return (
        <div style={{ minHeight: "100vh", background: "#ffffff" }}>
            {/* Black Hero Header */}
            <div className="ink-hero">
                <div className="ink-container">
                    <h1 className="ink-hero-title">ink. Verified Delivery Dashboard</h1>
                    <p className="ink-hero-subtitle">Premium delivery protection and verification</p>
                </div>
            </div>

            {/* Main Content */}
            <div className="ink-container" style={{ paddingTop: "48px", paddingBottom: "48px" }}>
                {/* Stats Grid */}
                <div className="ink-stats-grid">
                    <div className="ink-stat-card">
                        <div className="ink-stat-value">{orders.length}</div>
                        <div className="ink-stat-label">Total Orders</div>
                    </div>

                    <div className="ink-stat-card">
                        <div className="ink-stat-value" style={{ color: "#000000" }}>{verifiedCount}</div>
                        <div className="ink-stat-label">Verified</div>
                    </div>

                    <div className="ink-stat-card">
                        <div className="ink-stat-value" style={{ color: "#000000" }}>{enrolledCount}</div>
                        <div className="ink-stat-label">Enrolled</div>
                    </div>

                    <div className="ink-stat-card">
                        <div className="ink-stat-value" style={{ color: "#999999" }}>{pendingCount}</div>
                        <div className="ink-stat-label">Pending</div>
                    </div>
                </div>

                {/* Search Bar */}
                <div style={{ marginBottom: "32px" }}>
                    <input
                        type="text"
                        className="ink-input"
                        placeholder="Search by order number or customer name..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                {filteredOrders.length === 0 ? (
                    <div className="ink-empty-state">
                        <h3 className="ink-empty-state-title">
                            {searchTerm ? "No orders found" : "No orders yet"}
                        </h3>
                        <p className="ink-empty-state-text">
                            {searchTerm ? "Try adjusting your search criteria" : "Orders with INK Verified Delivery will appear here"}
                        </p>
                    </div>
                ) : (
                    <>
                        {/* Mobile Orders List (Visible only on mobile) */}
                        <div className="ink-mobile-order-list">
                            {filteredOrders.map((order: Order) => {
                                const statusLower = order.verificationStatus.toLowerCase();
                                const badgeClass = 
                                    statusLower === "verified" ? "ink-badge-verified" :
                                    statusLower === "enrolled" ? "ink-badge-enrolled" :
                                    "ink-badge-pending";

                                return (
                                    <Link to={`/app/orders/${order.id}`} key={order.id} style={{ textDecoration: 'none', color: 'inherit' }}>
                                        <div className="ink-mobile-card">
                                            <div className="ink-mobile-card-top">
                                                <div className="ink-mobile-customer">
                                                    {order.customerName}
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <div className="ink-mobile-price">
                                                        {order.currency} {parseFloat(order.totalPrice).toFixed(2)}
                                                    </div>
                                                    <span style={{ color: '#ccc', fontSize: '18px' }}>›</span>
                                                </div>
                                            </div>

                                            <div className="ink-mobile-subtop">
                                                <span className="ink-mobile-id">{order.name}</span>
                                                <span className="ink-meta-dot">•</span>
                                                <span className="ink-mobile-date" suppressHydrationWarning>
                                                    {formatDate(order.createdAt)}
                                                </span>
                                            </div>
                                            
                                            {order.lineItems?.edges?.[0]?.node?.title && (
                                                <div className="ink-mobile-product">
                                                    {order.lineItems.edges[0].node.title}
                                                </div>
                                            )}
                                            
                                            <div className="ink-mobile-footer">
                                                <span className={`ink-badge ${badgeClass} ink-mobile-badge`}>
                                                    {order.verificationStatus}
                                                </span>
                                                <span className="ink-mobile-fulfillment">
                                                    {order.fulfillmentStatus || "Unfulfilled"}
                                                </span>
                                            </div>
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>

                        {/* Desktop Table (Hidden on mobile) */}
                        <div className="ink-desktop-table-container">
                            <table className="ink-table">
                                <thead>
                                    <tr>
                                        <th>Order</th>
                                        <th>Customer</th>
                                        <th>Date</th>
                                        <th>Total</th>
                                        <th>Status</th>
                                        <th>Verification</th>
                                        <th style={{ textAlign: "center" }}>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredOrders.map((order: Order) => {
                                        const statusLower = order.verificationStatus.toLowerCase();
                                        const badgeClass = 
                                            statusLower === "verified" ? "ink-badge-verified" :
                                            statusLower === "enrolled" ? "ink-badge-enrolled" :
                                            "ink-badge-pending";
                                        
                                        const badgeIcon = 
                                            statusLower === "verified" ? "✓" :
                                            statusLower === "enrolled" ? "◆" :
                                            "○";

                                        return (
                                            <tr key={order.id}>
                                                <td>
                                                    <strong style={{ fontWeight: 600 }}>{order.name}</strong>
                                                </td>
                                                <td>
                                                    <div style={{ fontWeight: 500 }}>{order.customerName}</div>
                                                    <div style={{ fontSize: "12px", color: "#999999", marginTop: "2px" }}>
                                                        {order.customerEmail}
                                                    </div>
                                                </td>
                                                <td style={{ color: "#666666" }} suppressHydrationWarning>
                                                    {formatDate(order.createdAt)}
                                                </td>
                                                <td>
                                                    <strong style={{ fontWeight: 600 }}>
                                                        {order.currency} {parseFloat(order.totalPrice).toFixed(2)}
                                                    </strong>
                                                </td>
                                                <td>
                                                    <div style={{ fontSize: "13px" }}>
                                                        <div>{order.fulfillmentStatus || "Unfulfilled"}</div>
                                                        <div style={{ color: "#999999", fontSize: "12px", marginTop: "2px" }}>
                                                            {order.financialStatus}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td>
                                                    <span className={`ink-badge ${badgeClass}`}>
                                                        {badgeIcon} {order.verificationStatus}
                                                    </span>
                                                    {order.hasProof && (
                                                        <div style={{ fontSize: "11px", color: "#666666", marginTop: "6px" }}>
                                                            Proof ID: {order.proofId.slice(0, 12)}...
                                                        </div>
                                                    )}
                                                </td>
                                                <td style={{ textAlign: "center" }}>
                                                    <Link
                                                        to={`/app/orders/${order.id}`}
                                                        className="ink-button"
                                                        style={{ fontSize: "13px", padding: "8px 16px" }}
                                                    >
                                                        View
                                                    </Link>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}