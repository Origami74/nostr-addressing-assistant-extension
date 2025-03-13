import type { DomainInfo } from '../types/nostr';

const STORAGE_KEY = 'nostrDomainInfo';

/**
 * Saves domain information to localStorage
 * @param domain The domain to save info for
 * @param pubkey The Nostr pubkey
 * @param relays Optional array of relay URLs
 * @returns boolean indicating if the save was successful
 */
export function saveDomainInfo(domain: string, pubkey: string, relays: string[] = []): boolean {
  try {
    // Get existing saved pairs
    const savedInfoJSON = localStorage.getItem(STORAGE_KEY) || '{}';
    const savedInfo = JSON.parse(savedInfoJSON);
    
    // Add or update the domain info
    savedInfo[domain] = {
      pubkey,
      relays
    };
    
    // Save back to localStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedInfo));
    return true;
  } catch (error) {
    console.error('Error saving domain info:', error);
    return false;
  }
}

/**
 * Retrieves saved domain information from localStorage
 * @param domain The domain to get info for
 * @returns The domain info or null if not found
 */
export function getSavedInfoForDomain(domain: string): DomainInfo | null {
  try {
    // Get existing saved pairs
    const savedInfoJSON = localStorage.getItem(STORAGE_KEY) || '{}';
    const savedInfo = JSON.parse(savedInfoJSON);
    
    // Return the info for this domain or null if not found
    return savedInfo[domain] || null;
  } catch (error) {
    console.error('Error getting saved info for domain:', error);
    return null;
  }
} 