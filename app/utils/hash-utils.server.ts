export async function generateSHA256Hash(file: File): Promise<string> {
  // Convert file to ArrayBuffer
  const arrayBuffer = await file.arrayBuffer();
  
  // Generate hash using Web Crypto API
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  
  // Convert to hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return hashHex;
}