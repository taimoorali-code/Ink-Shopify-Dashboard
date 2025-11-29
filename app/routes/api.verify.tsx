import { type ActionFunctionArgs } from "react-router";
import { serialNumberToUID } from "../utils/nfc-conversion.server";

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept, X-Requested-With, Origin",
};

// Handle OPTIONS preflight
export const loader = async () => {
    return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
    });
};

export const action = async ({ request }: ActionFunctionArgs) => {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();

    try {
        const payload = await request.json();
        const { serial_number, delivery_gps, device_info, phone_last4 } = payload;

        console.log("📍 Verify request received:", { serial_number, delivery_gps, device_info, phone_last4 });

        if (!serial_number || !delivery_gps) {
            await prisma.$disconnect();
            return new Response(
                JSON.stringify({ error: "Missing required fields: serial_number and delivery_gps" }),
                { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
            );
        }

        // Convert serial number to UID (deterministic)
        const uid = serialNumberToUID(serial_number);
        console.log(`✅ Converted serial to UID: ${uid}`);

        // Lookup proof by UID in database
        console.log("🔍 Looking up proof by UID:", uid);
        const proof = await prisma.proof.findFirst({
            where: { nfc_uid: uid },
        });

        if (!proof) {
            console.error("❌ UID not found in database:", uid);
            await prisma.$disconnect();
            return new Response(
                JSON.stringify({ error: "Tag not enrolled. Please enroll this package first at the warehouse." }),
                { status: 404, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
            );
        }

        console.log("✅ Proof found:", { proof_id: proof.proof_id, order_id: proof.order_id, token: proof.nfc_token });

        // Call Alan's server /verify endpoint with the token from database
        const NFS_API_URL = process.env.NFS_API_URL || "https://us-central1-inink-c76d3.cloudfunctions.net/api";
        const alanPayload = {
            nfc_token: proof.nfc_token,  // Use token from database
            delivery_gps,
            device_info,
            phone_last4,
        };

        console.log("🚀 Calling Alan's server /verify:", `${NFS_API_URL}/verify`);
        const alanResponse = await fetch(`${NFS_API_URL}/verify`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(alanPayload),
        });

        if (!alanResponse.ok) {
            const errorText = await alanResponse.text();
            console.error("❌ Alan's server error:", errorText);
            await prisma.$disconnect();
            return new Response(
                JSON.stringify({ error: `Verification service error: ${errorText}` }),
                { status: alanResponse.status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
            );
        }

        const alanData = await alanResponse.json();
        console.log("✅ Alan's server response:", alanData);

        // Update local database with verification info
        console.log("💾 Updating local database with verification info...");
        await prisma.proof.update({
            where: { proof_id: proof.proof_id },
            data: {
                delivery_timestamp: new Date(),
                delivery_gps: JSON.stringify(delivery_gps),
                device_info,
                gps_verdict: alanData.gps_verdict,
                phone_verified: !!phone_last4,
            },
        });
        console.log("✅ Local database updated");

        await prisma.$disconnect();

        // Return Alan's response to frontend
        return new Response(JSON.stringify(alanData), {
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });

    } catch (error: any) {
        console.error("❌ Verify error:", error);
        await prisma.$disconnect();
        return new Response(
            JSON.stringify({ error: error.message || "Verification failed" }),
            { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
    }
};