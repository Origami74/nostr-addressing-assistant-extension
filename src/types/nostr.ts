/**
 * Types for Nostr-related data
 */

/**
 * Information about a domain and its associated Nostr data
 */
export interface DomainInfo {
  pubkey: string;
  relays: string[];
}

/**
 * Information about a domain from a NIP-37 event
 */
export interface Nip37Domain {
  domain: string;
  protocol: string;
} 