// app/utils/shopify-files.server.ts
import { authenticate } from "../shopify.server";

type AdminClient = Awaited<ReturnType<typeof authenticate.admin>>["admin"];

/**
 * Generates a staged upload target for a file.
 */
export async function getStagedUploadTarget(
  admin: AdminClient,
  args: {
    filename: string;
    mimeType: string;
    resource: "IMAGE" | "FILE"; // 'IMAGE' for images, 'FILE' for others
    fileSize: string;
  }
) {
  const response = await admin.graphql(
    `#graphql
    mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets {
          url
          resourceUrl
          parameters {
            name
            value
          }
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      variables: {
        input: [
          {
            filename: args.filename,
            mimeType: args.mimeType,
            resource: args.resource,
            fileSize: args.fileSize,
            httpMethod: "POST",
          },
        ],
      },
    }
  );

  const data = await response.json();
  const stagedUploadsCreate = data.data?.stagedUploadsCreate;
  const target = stagedUploadsCreate?.stagedTargets?.[0];
  const errors = stagedUploadsCreate?.userErrors;

  if (errors?.length > 0) {
    console.error(
      "stagedUploadsCreate userErrors:",
      JSON.stringify(errors, null, 2)
    );
    throw new Error(`Staged upload creation failed: ${JSON.stringify(errors)}`);
  }

  if (!target) {
    console.error(
      "stagedUploadsCreate response with no target:",
      JSON.stringify(data, null, 2)
    );
    throw new Error("No staged upload target returned");
  }

  return target;
}

/**
 * Registers the uploaded file in Shopify (Content > Files) and returns the file object.
 */
export async function registerUploadedFile(
  admin: AdminClient,
  resourceUrl: string
) {
  const response = await admin.graphql(
    `#graphql
    mutation fileCreate($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files {
          ... on GenericFile {
            id
            url
            fileStatus
          }
          ... on MediaImage {
            id
            image {
              url
            }
            fileStatus
          }
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      variables: {
        files: [
          {
            originalSource: resourceUrl,
            contentType: "IMAGE", // 'IMAGE' because your staged upload resource is IMAGE
          },
        ],
      },
    }
  );

  const data = await response.json();
  console.log("fileCreate response:", JSON.stringify(data, null, 2));

  const fileCreate = data.data?.fileCreate;
  const file = fileCreate?.files?.[0];
  const errors = fileCreate?.userErrors;

  if (errors?.length > 0) {
    console.error("fileCreate userErrors:", JSON.stringify(errors, null, 2));
    throw new Error(`File registration failed: ${JSON.stringify(errors)}`);
  }

  if (!file) {
    throw new Error("No file returned after registration");
  }

  // The URL might be null while the file is still processing.
  // For MediaImage, the URL is nested under image.url.
  const publicUrl = file.url || file.image?.url || null;

  return {
    id: file.id,
    url: publicUrl as string | null,
    status: file.fileStatus,
  };
}

/**
 * Query a file by ID to get its current details
 */
export async function getFileById(admin: AdminClient, fileId: string) {
  const response = await admin.graphql(
    `#graphql
    query getFile($id: ID!) {
      node(id: $id) {
        ... on MediaImage {
          id
          image {
            url
          }
          fileStatus
        }
        ... on GenericFile {
          id
          url
          fileStatus
        }
      }
    }`,
    {
      variables: { id: fileId },
    }
  );

  const data = await response.json();
  const node = data.data?.node;
  
  if (!node) {
    return null;
  }

  return {
    id: node.id,
    url: node.url || node.image?.url || null,
    status: node.fileStatus,
  };
}

/**
 * Poll for file URL to be ready (Shopify processes images asynchronously)
 */
export async function pollForFileUrl(
  admin: AdminClient, 
  fileId: string, 
  maxAttempts = 10, 
  delayMs = 500
): Promise<string> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`🔄 Polling for file URL (attempt ${attempt}/${maxAttempts})...`);
    
    const file = await getFileById(admin, fileId);
    
    if (file?.url) {
      console.log(`✅ File URL ready: ${file.url}`);
      return file.url;
    }

    if (attempt < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  throw new Error(`File URL not available after ${maxAttempts} attempts`);
}
