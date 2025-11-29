import crypto from "crypto";

/**
 * Convert NFC serial number to UID (deterministic)
 * Same serial number ALWAYS produces same UID
 * 
 * @param serialNumber - The NFC tag's serial number (e.g., "12:12:11" or "04:A3:B2:C1:D4:E5:F6")
 * @returns A deterministic 16-character UID
 */
export function serialNumberToUID(serialNumber: string): string {
  // Remove all non-alphanumeric characters (colons, spaces, dashes, etc.)
  const cleaned = serialNumber.replace(/[^0-9a-fA-F]/gi, '').toLowerCase();
  
  console.log(`🔄 Converting serial number to UID: "${serialNumber}" → cleaned: "${cleaned}"`);
  
  // Create deterministic hash using SHA-256
  const hash = crypto.createHash('sha256').update(cleaned).digest('hex');
  
  // Return first 16 characters as UID
  const uid = hash.substring(0, 16);
  
  console.log(`✅ Generated UID: "${uid}"`);
  return uid;
}

/**
 * Convert UID to Token (deterministic)
 * Same UID ALWAYS produces same Token
 * 
 * @param uid - The UID generated from serial number
 * @returns A deterministic token with "token_" prefix
 */
export function uidToToken(uid: string): string {
  console.log(`🔄 Converting UID to Token: "${uid}"`);
  
  // Create deterministic hash using SHA-256
  const hash = crypto.createHash('sha256').update(uid).digest('hex');
  
  // Format with prefix
  const token = `token_${hash}`;
  
  console.log(`✅ Generated Token: "${token}"`);
  return token;
}

/**
 * Complete conversion: Serial Number → UID → Token
 * This is the main function used by enrollment and verification
 * 
 * @param serialNumber - The NFC tag's serial number
 * @returns Object containing both UID and Token
 */
export function serialNumberToToken(serialNumber: string): { uid: string; token: string } {
  console.log(`🎯 Starting complete conversion for serial: "${serialNumber}"`);
  
  const uid = serialNumberToUID(serialNumber);
  const token = uidToToken(uid);
  
  console.log(`✅ Conversion complete: UID="${uid}", Token="${token}"`);
  
  return { uid, token };
}

/**
 * Test the conversion functions with sample data
 * This ensures the functions are deterministic
 */
export function testConversion() {
  console.log("\n🧪 Testing NFC Conversion Functions...\n");
  
  const testSerial = "12:12:11";
  
  // Test 1: Same serial number should produce same results
  const result1 = serialNumberToToken(testSerial);
  const result2 = serialNumberToToken(testSerial);
  
  console.log(`\nTest 1: Determinism Check`);
  console.log(`Result 1: UID="${result1.uid}", Token="${result1.token}"`);
  console.log(`Result 2: UID="${result2.uid}", Token="${result2.token}"`);
  console.log(`✅ Determinism: ${result1.uid === result2.uid && result1.token === result2.token ? "PASS" : "FAIL"}`);
  
  // Test 2: Different serial numbers should produce different results
  const result3 = serialNumberToToken("13:13:12");
  console.log(`\nTest 2: Uniqueness Check`);
  console.log(`Different serial produces different UID: ${result1.uid !== result3.uid ? "PASS" : "FAIL"}`);
  
  console.log("\n✅ All tests complete\n");
}