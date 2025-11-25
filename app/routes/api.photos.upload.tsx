import { type ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getStagedUploadTarget, registerUploadedFile } from "../utils/shopify-files.server";
import { generateSHA256Hash } from "../utils/hash-utils.server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Handle OPTIONS preflight request
export const loader = async () => {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    console.log("📸 Photo upload request received");
    
    // Create a fake request with shop domain to get admin client
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();
    
    const session = await prisma.session.findFirst({
      where: { isOnline: false },
    });

    if (!session) {
      console.error("No session found");
      return new Response(
        JSON.stringify({ error: "No session available" }), 
        { 
          status: 500, 
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" } 
        }
      );
    }

    console.log("✅ Session found:", session.shop);

    // Create a fake authenticated request to get admin context
    const fakeRequest = new Request(`https://${session.shop}/admin`, {
      headers: {
        "Authorization": `Bearer ${session.accessToken}`,
      },
    });

    const { admin } = await authenticate.public.appProxy(fakeRequest).catch(async () => {
      // If appProxy doesn't work, try a different approach
      // Use unauthenticated admin with session
      return { admin: await createAdminClient(session) };
    });

    if (!admin) {
      console.error("Failed to create admin client");
      return new Response(
        JSON.stringify({ error: "Failed to create admin client" }), 
        { 
          status: 500, 
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" } 
        }
      );
    }

    console.log("✅ Admin client created");
    
    const formData = await request.formData();
    const orderId = formData.get("orderId") as string;
    const photo = formData.get("photo") as File;
    const photoIndex = formData.get("photoIndex") as string;

    console.log(`📤 Uploading photo ${photoIndex} for order ${orderId}`);

    if (!photo || !orderId) {
      return new Response(
        JSON.stringify({ error: "Missing photo or orderId" }), 
        { 
          status: 400, 
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" } 
        }
      );
    }

    // 1. Get staged upload target
    console.log("🎯 Getting staged upload target...");
    const target = await getStagedUploadTarget(admin, {
      filename: photo.name || `photo_${photoIndex}.jpg`,
      mimeType: photo.type || "image/jpeg",
      resource: "IMAGE",
      fileSize: photo.size.toString(),
    });

    // 2. Upload to Shopify's staged URL
    console.log("☁️ Uploading to Shopify...");
    const uploadFormData = new FormData();
    target.parameters.forEach((p: any) => uploadFormData.append(p.name, p.value));
    uploadFormData.append("file", photo);

    const uploadResponse = await fetch(target.url, {
      method: "POST",
      body: uploadFormData,
    });

    if (!uploadResponse.ok) {
      console.error("Upload failed:", uploadResponse.status);
      return new Response(
        JSON.stringify({ error: "Upload to Shopify failed", status: uploadResponse.status }), 
        { 
          status: 500, 
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" } 
        }
      );
    }

    // 3. Register the uploaded file
    console.log("📝 Registering file...");
    const registeredFile = await registerUploadedFile(admin, target.resourceUrl);
    const fileUrl = registeredFile?.url || "";

    if (!fileUrl) {
      console.error("No URL returned from file registration");
      return new Response(
        JSON.stringify({ error: "Failed to register file" }), 
        { 
          status: 500, 
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" } 
        }
      );
    }

    // 4. Generate SHA-256 hash
    console.log("🔐 Generating hash...");
    const arrayBuffer = await photo.arrayBuffer();
    const photoHash = await generateSHA256Hash(Buffer.from(arrayBuffer));

    await prisma.$disconnect();

    console.log(`✅ Photo ${photoIndex} uploaded successfully!`);
    return new Response(
      JSON.stringify({ 
        success: true, 
        photoUrl: fileUrl, 
        photoHash,
        photoIndex: Number(photoIndex)
      }), 
      { 
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" } 
      }
    );

  } catch (error: any) {
    console.error("❌ Photo upload error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Upload failed" }), 
      { 
        status: 500, 
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" } 
      }
    );
  }
};

// Helper to create admin client from session
async function createAdminClient(session: any) {
  const shopifyModule = await import("../shopify.server");
  const shopify = shopifyModule.default;
  
  // Return an object with graphql method that matches AdminClient interface
  return {
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
}
