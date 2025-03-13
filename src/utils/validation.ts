/**
 * Validation utilities for Nostr-related data
 */

/**
 * Validates if a string is a valid hex-formatted Nostr public key
 * @param pubkey The public key to validate
 * @returns boolean indicating if the pubkey is valid
 */
export function isValidHexPubkey(pubkey: string): boolean {
  // Nostr hex pubkeys are 64 characters long (32 bytes) and contain only hex characters
  const hexRegex = /^[0-9a-f]{64}$/i;
  return hexRegex.test(pubkey);
}

/**
 * Validates if a string is a valid Nostr relay URL
 * @param url The URL to validate
 * @returns boolean indicating if the URL is a valid relay URL
 */
export function isValidRelayUrl(url: string): boolean {
  try {
    // Check if it's a valid URL and uses the wss:// or ws:// protocol
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === 'wss:' || parsedUrl.protocol === 'ws:';
  } catch (e) {
    return false;
  }
}

/**
 * Parses a comma-separated string of relay URLs into an array of valid relay URLs
 * @param relayString The comma-separated string of relay URLs
 * @returns An array of validated relay URLs
 */
export function parseRelays(relayString: string | null): string[] {
  if (!relayString) return [];
  
  // Split by commas and remove whitespace
  return relayString
    .split(',')
    .map(relay => relay.trim())
    .filter(relay => relay && isValidRelayUrl(relay));
} 