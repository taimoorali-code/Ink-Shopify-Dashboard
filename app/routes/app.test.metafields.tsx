import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";
import { setOrderMetafield, getOrderMetafields, METAFIELDS } from "../utils/metafields.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    return {
        message: "Enter an Order ID to test metafield operations"
    };
};

export const action = async ({ request }: ActionFunctionArgs) => {
    const formData = await request.formData();
    const orderId = formData.get("orderId") as string;
    const actionType = formData.get("action") as string;

    try {
        if (actionType === "set") {
            // Set a test metafield
            const result = await setOrderMetafield(
                request,
                orderId,
                METAFIELDS.VERIFICATION_STATUS,
                "Pending"
            );

            return {
                success: true,
                message: "Metafield created successfully",
                data: result
            };
        } else if (actionType === "get") {
            // Get all metafields for the order
            const metafields = await getOrderMetafields(request, orderId);

            return {
                success: true,
                message: "Metafields retrieved successfully",
                data: metafields
            };
        }

        return { success: false, message: "Invalid action", data: null };
    } catch (error: any) {
        console.error("Error in metafield action:", error);
        return {
            success: false,
            message: error.message || "An error occurred",
            data: null
        };
    }
};

export default function TestMetafields() {
    const loaderData = useLoaderData<typeof loader>();
    const actionData = useActionData<typeof action>();
    const [orderId, setOrderId] = useState("");

    return (
        <s-page>
            <s-section heading="Test Metafields">
                <p style={{ marginBottom: "20px" }}>
                    {loaderData?.message || "Enter an Order ID to test metafield operations"}
                </p>

                <Form method="post">
                    <s-text-field
                        label="Order ID"
                        name="orderId"
                        value={orderId}
                        // @ts-ignore - Shopify custom element
                        onChange={(e) => setOrderId(e.currentTarget.value)}
                        placeholder="Enter order ID (numeric only)"
                        details="Example: 5479776428212"
                    />

                    <div style={{ marginTop: "16px", display: "flex", gap: "12px" }}>
                        <button
                            type="submit"
                            name="action"
                            value="set"
                            style={{
                                padding: "8px 16px",
                                backgroundColor: "#008060",
                                color: "white",
                                border: "none",
                                borderRadius: "4px",
                                cursor: "pointer"
                            }}
                        >
                            Set Test Metafield
                        </button>

                        <button
                            type="submit"
                            name="action"
                            value="get"
                            style={{
                                padding: "8px 16px",
                                backgroundColor: "#f6f6f7",
                                color: "#202223",
                                border: "1px solid #c9cccf",
                                borderRadius: "4px",
                                cursor: "pointer"
                            }}
                        >
                            Get Metafields
                        </button>
                    </div>
                </Form>

                {actionData && (
                    <div style={{ marginTop: "24px" }}>
                        <s-banner
                            // @ts-ignore - Shopify custom element
                            tone={actionData.success ? "success" : "critical"}
                        >
                            {actionData.message}
                        </s-banner>

                        {actionData.data && (
                            <div style={{
                                marginTop: "16px",
                                padding: "16px",
                                background: "#f6f6f7",
                                borderRadius: "8px",
                                fontFamily: "monospace",
                                fontSize: "12px",
                                overflow: "auto"
                            }}>
                                <pre>{JSON.stringify(actionData.data, null, 2)}</pre>
                            </div>
                        )}
                    </div>
                )}
            </s-section>

            <s-section heading="Metafield Keys in 'ink' namespace">
                <ul style={{ marginTop: "12px", paddingLeft: "20px" }}>
                    <li><strong>verification_status</strong> - Tracks Verified / Pending / Flagged</li>
                    <li><strong>nfc_uid</strong> - Stores NFC tag UID</li>
                    <li><strong>proof_reference</strong> - Backend reference ID</li>
                    <li><strong>photos_hashes</strong> - SHA-256 hashes of photos</li>
                    <li><strong>delivery_gps</strong> - GPS and timestamp data</li>
                </ul>
            </s-section>
        </s-page>
    );
}