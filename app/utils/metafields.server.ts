import { authenticate } from "~/shopify.server";

export const INK_NAMESPACE = "ink";

export const METAFIELDS = {
    VERIFICATION_STATUS: "verification_status",
    NFC_UID: "nfc_uid",
    PROOF_REFERENCE: "proof_reference",
    PHOTOS_HASHES: "photos_hashes",
    DELIVERY_GPS: "delivery_gps",
};

export async function setOrderMetafield(
    request: Request,
    orderId: string,
    key: string,
    value: string
) {
    const { admin } = await authenticate.admin(request);

    const mutation = `
        mutation CreateOrderMetafield($metafields: [MetafieldsSetInput!]!) {
            metafieldsSet(metafields: $metafields) {
                metafields {
                    id
                    namespace
                    key
                    value
                }
                userErrors {
                    field
                    message
                }
            }
        }
    `;

    const variables = {
        metafields: [
            {
                ownerId: `gid://shopify/Order/${orderId}`,
                namespace: INK_NAMESPACE,
                key: key,
                type: "single_line_text_field",
                value: value,
            },
        ],
    };

    try {
        const response = await admin.graphql(mutation, { variables });
        const data = await response.json();

        if (data.data?.metafieldsSet?.userErrors?.length > 0) {
            console.error("❌ Metafield errors:", data.data.metafieldsSet.userErrors);
            throw new Error(data.data.metafieldsSet.userErrors[0].message);
        }

        console.log("✅ Metafield created:", data.data?.metafieldsSet?.metafields[0]);
        return data.data?.metafieldsSet?.metafields[0];
    } catch (error: any) {
        console.error("❌ Error creating metafield:", error);
        throw error;
    }
}

export async function getOrderMetafields(request: Request, orderId: string) {
    const { admin } = await authenticate.admin(request);

    const query = `
        query GetOrderMetafields($id: ID!) {
            order(id: $id) {
                id
                name
                metafields(namespace: "${INK_NAMESPACE}", first: 10) {
                    edges {
                        node {
                            id
                            namespace
                            key
                            value
                        }
                    }
                }
            }
        }
    `;

    try {
        const response = await admin.graphql(query, {
            variables: { id: `gid://shopify/Order/${orderId}` },
        });
        const data = await response.json();
        return data.data?.order?.metafields?.edges?.map((edge: any) => edge.node) || [];
    } catch (error: any) {
        console.error("❌ Error fetching metafields:", error);
        throw error;
    }
}