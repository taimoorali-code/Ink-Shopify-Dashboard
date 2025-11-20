import { useState } from "react";
import { useLoaderData, useNavigate, Form, useActionData } from "react-router";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { generateSHA256Hash } from "../utils/hash-utils.server";
import { setOrderMetafield, getOrderMetafields, METAFIELDS } from "../utils/metafields.server";

// Define types
interface Product {
    title: string;
    quantity: number;
    price: string;
    sku: string;
    image: string | null;
}

interface OrderDetail {
    id: string;
    name: string;
    createdAt: string;
    financialStatus: string;
    fulfillmentStatus: string;
    totalPrice: string;
    currency: string;
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    shippingAddress: {
        address1: string;
        address2: string;
        city: string;
        province: string;
        zip: string;
        country: string;
    } | null;
    products: Product[];
    metafields: {
        verification_status?: string;
        nfc_uid?: string;
        proof_reference?: string;
        photos_hashes?: string;
        delivery_gps?: string;
    };
}

interface LoaderData {
    order: OrderDetail | null;
    error?: string;
}

// Loader: Fetch single order details
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
    const { admin } = await authenticate.admin(request);
    const { orderId } = params;

    if (!orderId) {
        return { order: null, error: "Order ID is required" };
    }

    const query = `
    query GetOrderDetail($id: ID!) {
      order(id: $id) {
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
          phone
        }
        shippingAddress {
          address1
          address2
          city
          province
          zip
          country
        }
        lineItems(first: 10) {
          edges {
            node {
              title
              quantity
              originalUnitPriceSet {
                shopMoney {
                  amount
                }
              }
              sku
              image {
                url
              }
            }
          }
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
  `;

    try {
        const response = await admin.graphql(query, {
            variables: { id: `gid://shopify/Order/${orderId}` },
        });
        const data = await response.json();

        if (!data.data?.order) {
            return { order: null, error: "Order not found" };
        }

        const orderData = data.data.order;

        // Extract metafields
        const metafields: OrderDetail["metafields"] = {};
        orderData.metafields.edges.forEach((edge: any) => {
            metafields[edge.node.key as keyof OrderDetail["metafields"]] = edge.node.value;
        });

        // Extract products
        const products: Product[] = orderData.lineItems.edges.map((edge: any) => ({
            title: edge.node.title,
            quantity: edge.node.quantity,
            price: edge.node.originalUnitPriceSet.shopMoney.amount,
            sku: edge.node.sku || "N/A",
            image: edge.node.image?.url || null,
        }));

        const order: OrderDetail = {
            id: orderId,
            name: orderData.name,
            createdAt: orderData.createdAt,
            financialStatus: orderData.displayFinancialStatus,
            fulfillmentStatus: orderData.displayFulfillmentStatus,
            totalPrice: orderData.totalPriceSet.shopMoney.amount,
            currency: orderData.totalPriceSet.shopMoney.currencyCode,
            customerName: orderData.customer
                ? `${orderData.customer.firstName} ${orderData.customer.lastName}`
                : "Guest",
            customerEmail: orderData.customer?.email || "",
            customerPhone: orderData.customer?.phone || "",
            shippingAddress: orderData.shippingAddress || null,
            products,
            metafields,
        };

        return { order };
    } catch (error) {
        console.error("Error fetching order:", error);
        return { order: null, error: "Failed to load order details" };
    }
};

// Action: Handle photo uploads
export const action = async ({ request, params }: ActionFunctionArgs) => {
    const { orderId } = params;
    const formData = await request.formData();

    const photoIndex = formData.get("photoIndex") as string;
    const photoFile = formData.get("photo") as File;
    const actionType = formData.get("actionType") as string;

    if (!orderId) {
        return {
            success: false,
            message: "Order ID is required",
            photoIndex: null
        };
    }

    try {
        if (actionType === "uploadPhoto" && photoFile) {
            // Generate SHA-256 hash
            const photoHash = await generateSHA256Hash(photoFile);

            // Get existing photos hashes
            const existingHashes = await getOrderMetafields(request, orderId);
            const photosHashesField = existingHashes.find(
                (meta: any) => meta.key === METAFIELDS.PHOTOS_HASHES
            );

            // Parse existing hashes or create new array
            let hashesArray: string[] = [];
            if (photosHashesField?.value) {
                hashesArray = JSON.parse(photosHashesField.value);
            }

            // Update the specific photo hash
            const index = parseInt(photoIndex);
            hashesArray[index] = photoHash;

            // Store updated hashes in metafield
            await setOrderMetafield(
                request,
                orderId,
                METAFIELDS.PHOTOS_HASHES,
                JSON.stringify(hashesArray)
            );

            return {
                success: true,
                message: `Photo ${index + 1} uploaded and verified! Hash: ${photoHash.substring(0, 16)}...`,
                photoIndex: index,
                photoHash
            };
        }

        return {
            success: false,
            message: "Invalid action",
            photoIndex: null
        };
    } catch (error: any) {
        console.error("Error uploading photo:", error);
        return {
            success: false,
            message: error.message || "Failed to upload photo",
            photoIndex: null
        };
    }
};
// Helper function to format date
function formatDate(isoDate: string): string {
    const date = new Date(isoDate);
    return date.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

// Helper function to get status badge
function getStatusBadge(status?: string) {
    const statusLower = status?.toLowerCase() || "not set";

    if (statusLower === "verified") {
        return { tone: "success", icon: "✅", text: "Verified" };
    } else if (statusLower === "pending") {
        return { tone: "attention", icon: "⏳", text: "Pending" };
    } else if (statusLower === "flagged") {
        return { tone: "critical", icon: "🚩", text: "Flagged" };
    } else {
        return { tone: "info", icon: "ℹ️", text: "Not Set" };
    }
}

export default function OrderDetail() {
    const { order, error } = useLoaderData<LoaderData>();
    const actionData = useActionData<typeof action>();
    const navigate = useNavigate();

    // State for photo uploads
    const [photos, setPhotos] = useState<(File | null)[]>([null, null, null, null]);
    const [photoPreviews, setPhotoPreviews] = useState<(string | null)[]>([null, null, null, null]);
    const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);

    const [uploadProgress, setUploadProgress] = useState<number[]>([0, 0, 0, 0]);
    const [uploadStatus, setUploadStatus] = useState<('idle' | 'uploading' | 'success' | 'error')[]>(['idle', 'idle', 'idle', 'idle']);

    if (error || !order) {
        return (
            <s-page>
                <s-section>
                    <s-banner tone="critical">
                        {error || "Order not found"}
                    </s-banner>
                    <div style={{ marginTop: "16px" }}>
                        <button
                            onClick={() => navigate("/app")}
                            style={{
                                padding: "8px 16px",
                                background: "#008060",
                                color: "white",
                                border: "none",
                                borderRadius: "4px",
                                cursor: "pointer"
                            }}
                        >
                            ← Back to Dashboard
                        </button>
                    </div>
                </s-section>
            </s-page>
        );
    }

    const badge = getStatusBadge(order.metafields.verification_status);

    // Handle file selection
    const handleFileSelect = (index: number, file: File | null) => {
        if (!file) return;

        // Validate file type
        if (!file.type.startsWith("image/")) {
            alert("Please select an image file");
            return;
        }

        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            alert("File size must be less than 5MB");
            return;
        }

        // Update photos array
        const newPhotos = [...photos];
        newPhotos[index] = file;
        setPhotos(newPhotos);

        // Create preview
        const reader = new FileReader();
        reader.onloadend = () => {
            const newPreviews = [...photoPreviews];
            newPreviews[index] = reader.result as string;
            setPhotoPreviews(newPreviews);
        };
        reader.readAsDataURL(file);
    };

    // Handle photo removal
    const handleRemovePhoto = (index: number) => {
        const newPhotos = [...photos];
        newPhotos[index] = null;
        setPhotos(newPhotos);

        const newPreviews = [...photoPreviews];
        newPreviews[index] = null;
        setPhotoPreviews(newPreviews);
    };

    // Replace the handleUploadPhoto function with this enhanced version
    const handleUploadPhoto = async (index: number) => {
        const photo = photos[index];
        if (!photo) return;

        // Update status to uploading
        const newStatus = [...uploadStatus];
        newStatus[index] = 'uploading';
        setUploadStatus(newStatus);

        setUploadingIndex(index);
        setUploadProgress(prev => {
            const newProgress = [...prev];
            newProgress[index] = 0;
            return newProgress;
        });

        // Simulate progress (in real app, you'd use actual progress events)
        const progressInterval = setInterval(() => {
            setUploadProgress(prev => {
                const newProgress = [...prev];
                if (newProgress[index] < 90) {
                    newProgress[index] += 10;
                }
                return newProgress;
            });
        }, 200);

        try {
            const formData = new FormData();
            formData.append("photo", photo);
            formData.append("photoIndex", index.toString());
            formData.append("actionType", "uploadPhoto");

            const response = await fetch(`/app/orders/${order.id}`, {
                method: "POST",
                body: formData,
            });

            const result = await response.json();

            // Complete progress
            setUploadProgress(prev => {
                const newProgress = [...prev];
                newProgress[index] = 100;
                return newProgress;
            });

            if (result.success) {
                // ✅ SUCCESS
                const newStatus = [...uploadStatus];
                newStatus[index] = 'success';
                setUploadStatus(newStatus);

                // Auto-clear success after 3 seconds
                setTimeout(() => {
                    setUploadStatus(prev => {
                        const newStatus = [...prev];
                        newStatus[index] = 'idle';
                        return newStatus;
                    });
                }, 3000);

            } else {
                // ❌ FAILED
                const newStatus = [...uploadStatus];
                newStatus[index] = 'error';
                setUploadStatus(newStatus);
                alert(`❌ ${result.message}`);
            }
        } catch (error) {
            console.error("Upload failed:", error);
            const newStatus = [...uploadStatus];
            newStatus[index] = 'error';
            setUploadStatus(newStatus);
            alert("❌ Upload failed. Please try again.");
        } finally {
            clearInterval(progressInterval);
            setUploadingIndex(null);
        }
    };

    // Add this retry function
    const handleRetryUpload = (index: number) => {
        const newStatus = [...uploadStatus];
        newStatus[index] = 'idle';
        setUploadStatus(newStatus);
        setUploadProgress(prev => {
            const newProgress = [...prev];
            newProgress[index] = 0;
            return newProgress;
        });
        handleUploadPhoto(index);
    };

    return (
        <s-page>
            {/* Header Section */}
            <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "24px",
                padding: "16px",
                background: "#f6f6f7",
                borderRadius: "8px"
            }}>
                <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <h1 style={{ margin: 0, fontSize: "24px" }}>{order.name}</h1>
                        <s-badge tone={badge.tone as any}>
                            {badge.icon} {badge.text}
                        </s-badge>
                    </div>
                    <p style={{ margin: "4px 0 0 0", color: "#6d7175" }}>
                        {formatDate(order.createdAt)}
                    </p>
                </div>
                <button
                    onClick={() => navigate("/app")}
                    style={{
                        padding: "8px 16px",
                        background: "white",
                        border: "1px solid #c9cccf",
                        borderRadius: "4px",
                        cursor: "pointer"
                    }}
                >
                    ← Back to Dashboard
                </button>
            </div>

            {/* Action feedback banner */}
            {actionData && (
                <div style={{ marginBottom: "20px" }}>
                    <s-banner tone={actionData.success ? "success" : "critical"}>
                        {actionData.message}
                    </s-banner>
                </div>
            )}

            {/* Main Content Grid */}
            <div style={{
                display: "grid",
                gridTemplateColumns: "2fr 1fr",
                gap: "20px"
            }}>
                {/* Left Column */}
                <div>
                    {/* Products Section */}
                    <s-section heading="Products">
                        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                            {order.products.map((product, index) => (
                                <div
                                    key={index}
                                    style={{
                                        display: "flex",
                                        gap: "12px",
                                        padding: "12px",
                                        border: "1px solid #e1e3e5",
                                        borderRadius: "8px"
                                    }}
                                >
                                    {product.image ? (
                                        <img
                                            src={product.image}
                                            alt={product.title}
                                            style={{
                                                width: "60px",
                                                height: "60px",
                                                objectFit: "cover",
                                                borderRadius: "4px"
                                            }}
                                        />
                                    ) : (
                                        <div
                                            style={{
                                                width: "60px",
                                                height: "60px",
                                                background: "#f6f6f7",
                                                borderRadius: "4px",
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center"
                                            }}
                                        >
                                            📦
                                        </div>
                                    )}
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: "bold" }}>{product.title}</div>
                                        <div style={{ fontSize: "12px", color: "#6d7175" }}>
                                            SKU: {product.sku}
                                        </div>
                                        <div style={{ fontSize: "12px", color: "#6d7175" }}>
                                            Quantity: {product.quantity}
                                        </div>
                                    </div>
                                    <div style={{ fontWeight: "bold" }}>
                                        {order.currency} {parseFloat(product.price).toFixed(2)}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div style={{
                            marginTop: "16px",
                            padding: "12px",
                            background: "#f6f6f7",
                            borderRadius: "8px",
                            display: "flex",
                            justifyContent: "space-between",
                            fontWeight: "bold",
                            fontSize: "18px"
                        }}>
                            <span>Total</span>
                            <span>{order.currency} {parseFloat(order.totalPrice).toFixed(2)}</span>
                        </div>
                    </s-section>

                    {/* Verification Details Section */}
                    <div style={{ marginTop: "20px" }}>
                        <s-section heading="Verification Details">
                            <div style={{ display: "grid", gap: "12px" }}>
                                <div style={{
                                    padding: "12px",
                                    background: "#f6f6f7",
                                    borderRadius: "8px"
                                }}>
                                    <div style={{ fontSize: "12px", color: "#6d7175" }}>Status</div>
                                    <div style={{ fontSize: "16px", fontWeight: "bold", marginTop: "4px" }}>
                                        {order.metafields.verification_status || "Not Set"}
                                    </div>
                                </div>

                                {order.metafields.nfc_uid && (
                                    <div style={{
                                        padding: "12px",
                                        background: "#f6f6f7",
                                        borderRadius: "8px"
                                    }}>
                                        <div style={{ fontSize: "12px", color: "#6d7175" }}>NFC Tag UID</div>
                                        <div style={{ fontSize: "14px", fontFamily: "monospace", marginTop: "4px" }}>
                                            🏷️ {order.metafields.nfc_uid}
                                        </div>
                                    </div>
                                )}

                                {order.metafields.delivery_gps && (
                                    <div style={{
                                        padding: "12px",
                                        background: "#f6f6f7",
                                        borderRadius: "8px"
                                    }}>
                                        <div style={{ fontSize: "12px", color: "#6d7175" }}>Delivery Location</div>
                                        <div style={{ fontSize: "14px", marginTop: "4px" }}>
                                            📍 {order.metafields.delivery_gps}
                                        </div>
                                    </div>
                                )}

                                {order.metafields.proof_reference && (
                                    <div style={{
                                        padding: "12px",
                                        background: "#f6f6f7",
                                        borderRadius: "8px"
                                    }}>
                                        <div style={{ fontSize: "12px", color: "#6d7175" }}>Proof Reference</div>
                                        <div style={{ fontSize: "14px", fontFamily: "monospace", marginTop: "4px" }}>
                                            {order.metafields.proof_reference}
                                        </div>
                                    </div>
                                )}

                                {!order.metafields.verification_status && (
                                    <div style={{
                                        padding: "16px",
                                        background: "#fff4e5",
                                        border: "1px solid #ffd580",
                                        borderRadius: "8px",
                                        textAlign: "center"
                                    }}>
                                        ⚠️ No verification data available yet
                                    </div>
                                )}
                            </div>
                        </s-section>
                    </div>

                    {/* Photo Upload Section */}
                    {/* Photo Upload Section */}
                    <div style={{ marginTop: "20px" }}>
                        <s-section heading="Delivery Proof Photos">
                            <p style={{ color: "#6d7175", marginBottom: "16px" }}>
                                Upload 4 photos as proof of delivery. Accepted formats: JPG, PNG (Max 5MB each)
                            </p>

                            <div style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(2, 1fr)",
                                gap: "16px"
                            }}>
                                {[0, 1, 2, 3].map((index) => (
                                    <div
                                        key={index}
                                        style={{
                                            border: uploadStatus[index] === 'error' ? "2px dashed #d72c0d" :
                                                uploadStatus[index] === 'success' ? "2px dashed #008060" : "2px dashed #c9cccf",
                                            borderRadius: "8px",
                                            padding: "16px",
                                            textAlign: "center",
                                            background: photoPreviews[index] ? "#fff" : "#f6f6f7",
                                            position: "relative",
                                            overflow: "hidden"
                                        }}
                                    >
                                        {/* Status Overlay */}
                                        {uploadStatus[index] === 'uploading' && (
                                            <div style={{
                                                position: "absolute",
                                                top: 0,
                                                left: 0,
                                                right: 0,
                                                bottom: 0,
                                                background: "rgba(255,255,255,0.9)",
                                                display: "flex",
                                                flexDirection: "column",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                zIndex: 10
                                            }}>
                                                <div style={{ fontSize: "24px", marginBottom: "8px" }}>⏳</div>
                                                <div style={{ fontWeight: "bold", marginBottom: "8px" }}>Uploading...</div>

                                                {/* Progress Bar */}
                                                <div style={{
                                                    width: "80%",
                                                    height: "6px",
                                                    background: "#e1e3e5",
                                                    borderRadius: "3px",
                                                    overflow: "hidden"
                                                }}>
                                                    <div style={{
                                                        width: `${uploadProgress[index]}%`,
                                                        height: "100%",
                                                        background: "#008060",
                                                        transition: "width 0.3s ease"
                                                    }} />
                                                </div>
                                                <div style={{ fontSize: "12px", color: "#6d7175", marginTop: "4px" }}>
                                                    {uploadProgress[index]}%
                                                </div>
                                            </div>
                                        )}

                                        {uploadStatus[index] === 'success' && (
                                            <div style={{
                                                position: "absolute",
                                                top: "8px",
                                                right: "8px",
                                                background: "#008060",
                                                color: "white",
                                                borderRadius: "12px",
                                                padding: "4px 8px",
                                                fontSize: "10px",
                                                fontWeight: "bold",
                                                zIndex: 5
                                            }}>
                                                ✅ VERIFIED
                                            </div>
                                        )}

                                        {uploadStatus[index] === 'error' && (
                                            <div style={{
                                                position: "absolute",
                                                top: "8px",
                                                right: "8px",
                                                background: "#d72c0d",
                                                color: "white",
                                                borderRadius: "12px",
                                                padding: "4px 8px",
                                                fontSize: "10px",
                                                fontWeight: "bold",
                                                zIndex: 5
                                            }}>
                                                ❌ FAILED
                                            </div>
                                        )}

                                        <div style={{ marginBottom: "12px", fontWeight: "bold" }}>
                                            Photo {index + 1}
                                        </div>

                                        {/* Photo Preview */}
                                        {photoPreviews[index] ? (
                                            <div>
                                                <img
                                                    src={photoPreviews[index]!}
                                                    alt={`Preview ${index + 1}`}
                                                    style={{
                                                        width: "100%",
                                                        height: "200px",
                                                        objectFit: "cover",
                                                        borderRadius: "4px",
                                                        marginBottom: "12px",
                                                        opacity: uploadStatus[index] === 'uploading' ? 0.3 : 1
                                                    }}
                                                />
                                                <div style={{ display: "flex", gap: "8px", justifyContent: "center" }}>
                                                    <button
                                                        onClick={() => handleRemovePhoto(index)}
                                                        disabled={uploadStatus[index] === 'uploading'}
                                                        style={{
                                                            padding: "6px 12px",
                                                            background: "#d72c0d",
                                                            color: "white",
                                                            border: "none",
                                                            borderRadius: "4px",
                                                            cursor: uploadStatus[index] === 'uploading' ? "not-allowed" : "pointer",
                                                            fontSize: "12px",
                                                            opacity: uploadStatus[index] === 'uploading' ? 0.5 : 1
                                                        }}
                                                    >
                                                        Remove
                                                    </button>

                                                    {uploadStatus[index] === 'error' ? (
                                                        <button
                                                            onClick={() => handleRetryUpload(index)}
                                                            style={{
                                                                padding: "6px 12px",
                                                                background: "#ffa500",
                                                                color: "white",
                                                                border: "none",
                                                                borderRadius: "4px",
                                                                cursor: "pointer",
                                                                fontSize: "12px"
                                                            }}
                                                        >
                                                            Retry
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={() => handleUploadPhoto(index)}
                                                            disabled={uploadStatus[index] === 'uploading' || uploadStatus[index] === 'success'}
                                                            style={{
                                                                padding: "6px 12px",
                                                                background: uploadStatus[index] === 'success' ? "#008060" :
                                                                    uploadStatus[index] === 'uploading' ? "#c9cccf" : "#008060",
                                                                color: "white",
                                                                border: "none",
                                                                borderRadius: "4px",
                                                                cursor: (uploadStatus[index] === 'uploading' || uploadStatus[index] === 'success') ? "not-allowed" : "pointer",
                                                                fontSize: "12px"
                                                            }}
                                                        >
                                                            {uploadStatus[index] === 'uploading' ? "Uploading..." :
                                                                uploadStatus[index] === 'success' ? "✓ Uploaded" : "Upload"}
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        ) : (
                                            <div>
                                                <div style={{ fontSize: "48px", marginBottom: "12px" }}>📷</div>
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    onChange={(e) => {
                                                        const file = e.target.files?.[0] || null;
                                                        handleFileSelect(index, file);
                                                    }}
                                                    style={{ display: "none" }}
                                                    id={`photo-input-${index}`}
                                                />
                                                <label
                                                    htmlFor={`photo-input-${index}`}
                                                    style={{
                                                        padding: "8px 16px",
                                                        background: "#008060",
                                                        color: "white",
                                                        borderRadius: "4px",
                                                        cursor: "pointer",
                                                        display: "inline-block",
                                                        fontSize: "14px"
                                                    }}
                                                >
                                                    Choose File
                                                </label>
                                                <p style={{ fontSize: "12px", color: "#6d7175", margin: "8px 0 0 0" }}>
                                                    or drag and drop
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {/* Upload Summary */}
                            <div style={{
                                marginTop: "16px",
                                padding: "12px",
                                background: "#f6f6f7",
                                borderRadius: "8px",
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center"
                            }}>
                                <div>
                                    <strong>Upload Status:</strong>
                                    {uploadStatus.filter(s => s === 'success').length}/4 photos verified
                                </div>
                                {uploadStatus.filter(s => s === 'success').length === 4 && (
                                    <div style={{ color: "#008060", fontWeight: "bold" }}>
                                        ✅ All photos verified and secured with SHA-256!
                                    </div>
                                )}
                            </div>

                            <div style={{
                                marginTop: "16px",
                                padding: "12px",
                                background: "#e0f5ff",
                                border: "1px solid #80caff",
                                borderRadius: "8px",
                                fontSize: "12px"
                            }}>
                                💡 <strong>Tip:</strong> Include photos of the package, delivery address, customer signature, and handover
                            </div>
                        </s-section>
                    </div>
                </div>

                {/* Right Column - Keep existing customer/shipping/status sections */}
                <div>
                    {/* Customer Information */}
                    <s-section heading="Customer">
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                            <div>
                                <div style={{ fontSize: "16px", fontWeight: "bold" }}>
                                    {order.customerName}
                                </div>
                                <div style={{ fontSize: "14px", color: "#6d7175" }}>
                                    {order.customerEmail}
                                </div>
                                {order.customerPhone && (
                                    <div style={{ fontSize: "14px", color: "#6d7175" }}>
                                        📞 {order.customerPhone}
                                    </div>
                                )}
                            </div>
                        </div>
                    </s-section>

                    {/* Shipping Address */}
                    <div style={{ marginTop: "20px" }}>
                        <s-section heading="Shipping Address">
                            {order.shippingAddress ? (
                                <div style={{ fontSize: "14px", lineHeight: "1.6" }}>
                                    <div>{order.shippingAddress.address1}</div>
                                    {order.shippingAddress.address2 && (
                                        <div>{order.shippingAddress.address2}</div>
                                    )}
                                    <div>
                                        {order.shippingAddress.city}, {order.shippingAddress.province}{" "}
                                        {order.shippingAddress.zip}
                                    </div>
                                    <div>{order.shippingAddress.country}</div>
                                </div>
                            ) : (
                                <p style={{ color: "#6d7175" }}>No shipping address available</p>
                            )}
                        </s-section>
                    </div>

                    {/* Order Status */}
                    <div style={{ marginTop: "20px" }}>
                        <s-section heading="Order Status">
                            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                                <div>
                                    <div style={{ fontSize: "12px", color: "#6d7175" }}>Payment</div>
                                    <div style={{ fontSize: "14px", fontWeight: "bold" }}>
                                        {order.financialStatus}
                                    </div>
                                </div>
                                <div>
                                    <div style={{ fontSize: "12px", color: "#6d7175" }}>Fulfillment</div>
                                    <div style={{ fontSize: "14px", fontWeight: "bold" }}>
                                        {order.fulfillmentStatus || "Unfulfilled"}
                                    </div>
                                </div>
                            </div>
                        </s-section>
                    </div>
                </div>
            </div>
        </s-page>
    );
}