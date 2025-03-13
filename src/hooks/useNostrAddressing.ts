import { useEffect, useState } from 'react';
import type { DomainInfo, Nip37Domain } from '../types/nostr';
import { isValidHexPubkey, parseRelays } from '../utils/validation';
import { generateColorFromDomain } from '../utils/ui';
import { getSavedInfoForDomain, saveDomainInfo } from '../services/storage';
import { fetchLatestNip37Event } from '../services/nostr';
import type { NostrEvent } from '@nostrify/nostrify';

export interface NostrAddressingState {
  domain: string;
  color: string;
  pubkey: string;
  relays: string[];
  isValidPubkey: boolean;
  savedInfo: DomainInfo | null;
  pubkeyMismatch: boolean;
  isNewDomain: boolean;
  relaysUpdated: boolean;
  nip37DomainMismatch: boolean;
  noNip37EventFound: boolean;
  nip37Domains: Nip37Domain[];
}

/**
 * Custom hook to handle Nostr addressing logic for a domain
 */
export function useNostrAddressing() {
  const [state, setState] = useState<NostrAddressingState>({
    domain: '',
    color: '',
    pubkey: '',
    relays: [],
    isValidPubkey: false,
    savedInfo: null,
    pubkeyMismatch: false,
    isNewDomain: false,
    relaysUpdated: false,
    nip37DomainMismatch: false,
    noNip37EventFound: false,
    nip37Domains: []
  });

  useEffect(() => {
    // Get the current tab's URL
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id && tabs[0]?.url) {
        const url = new URL(tabs[0].url);
        const currentDomain = url.hostname;
        
        // Update initial state
        setState(prevState => ({
          ...prevState,
          domain: currentDomain,
          color: generateColorFromDomain(currentDomain)
        }));
        
        // Check if we have saved info for this domain
        const previousInfo = getSavedInfoForDomain(currentDomain);
        
        // Update state with saved info
        setState(prevState => ({
          ...prevState,
          savedInfo: previousInfo
        }));
        
        // Execute script to extract the nostr-pubkey meta tag and relay information
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: () => {
            const metaTag = document.querySelector('meta[name="nostr-pubkey"]');
            if (!metaTag) return null;
            
            // Extract pubkey and relays
            const pubkey = metaTag.getAttribute('content');
            const relays = metaTag.getAttribute('relays') || metaTag.getAttribute('rel');
            
            return { pubkey, relays };
          }
        }).then(async results => {
          if (results && results[0].result) {
            const { pubkey: extractedPubkey, relays: extractedRelays } = results[0].result;
            
            if (extractedPubkey) {
              // Update state with extracted info
              setState(prevState => ({
                ...prevState,
                pubkey: extractedPubkey
              }));
              
              try {
                // Check if it's a valid hex pubkey
                const isValid = isValidHexPubkey(extractedPubkey);
                
                // Parse relays
                const parsedRelays = parseRelays(extractedRelays);
                
                // Update state with validation results
                setState(prevState => ({
                  ...prevState,
                  isValidPubkey: isValid,
                  relays: parsedRelays
                }));
                
                // Process pubkey and domain info
                if (isValid) {
                  await processValidPubkey(
                    currentDomain,
                    extractedPubkey,
                    parsedRelays,
                    previousInfo,
                    url.protocol.replace(':', '')
                  );
                }
              } catch (error) {
                console.error('Error validating pubkey:', error);
                setState(prevState => ({
                  ...prevState,
                  isValidPubkey: false
                }));
              }
            } else {
              setState(prevState => ({
                ...prevState,
                pubkey: 'No Nostr pubkey found',
                isValidPubkey: false
              }));
            }
          } else {
            setState(prevState => ({
              ...prevState,
              pubkey: 'No Nostr pubkey found',
              isValidPubkey: false
            }));
          }
          
          // Check if we should use saved info when no valid meta tag is present
          if (!state.isValidPubkey && previousInfo !== null) {
            await fallbackToSavedPubkey(currentDomain, previousInfo, url.protocol.replace(':', ''));
          }
        }).catch(error => {
          console.error('Error executing script:', error);
          setState(prevState => ({
            ...prevState,
            pubkey: 'Error accessing page content',
            isValidPubkey: false
          }));
        });
      }
    });
  }, []);

  /**
   * Processes a valid pubkey and checks for NIP-37 events
   */
  const processValidPubkey = async (
    currentDomain: string,
    extractedPubkey: string,
    parsedRelays: string[],
    previousInfo: DomainInfo | null,
    protocol: string
  ) => {
    if (previousInfo === null) {
      // First time seeing this domain with a valid pubkey
      setState(prevState => ({
        ...prevState,
        isNewDomain: true
      }));
      saveDomainInfo(currentDomain, extractedPubkey, parsedRelays);
    } else if (previousInfo.pubkey !== extractedPubkey) {
      // We have a different pubkey than what we've seen before
      setState(prevState => ({
        ...prevState,
        pubkeyMismatch: true
      }));
    } else {
      // Pubkey matches, always update relays (they don't have to match)
      // Only show update notification if relays have actually changed
      if (JSON.stringify(parsedRelays) !== JSON.stringify(previousInfo.relays)) {
        saveDomainInfo(currentDomain, extractedPubkey, parsedRelays);
        setState(prevState => ({
          ...prevState,
          relaysUpdated: true
        }));
      }
    }
    
    // Proceed with NIP-37 checks
    const pubkeyToCheck = state.pubkeyMismatch ? previousInfo?.pubkey || extractedPubkey : extractedPubkey;
    const relaysToUse = parsedRelays;
    
    await checkNip37Events(currentDomain, pubkeyToCheck, relaysToUse, protocol);
  };

  /**
   * Falls back to saved pubkey info when no valid meta tag is found
   */
  const fallbackToSavedPubkey = async (
    currentDomain: string,
    previousInfo: DomainInfo,
    protocol: string
  ) => {
    console.log('Using saved pubkey because current meta tag is missing or invalid');
    
    setState(prevState => ({
      ...prevState,
      pubkey: previousInfo.pubkey + ' (saved)',
      relays: previousInfo.relays,
      isValidPubkey: true
    }));
    
    await checkNip37Events(currentDomain, previousInfo.pubkey, previousInfo.relays, protocol);
  };

  /**
   * Checks for NIP-37 events that verify domain ownership
   */
  const checkNip37Events = async (
    currentDomain: string,
    pubkeyToCheck: string,
    relaysToUse: string[],
    protocol: string
  ) => {
    // request 11111 events from the appropriate pubkey
    const addressingEvent = await fetchLatestNip37Event(pubkeyToCheck, relaysToUse);
    
    if (addressingEvent) {
      await processNip37Event(addressingEvent, currentDomain, protocol);
    } else {
      // No NIP-37 event found for this pubkey
      console.log('No NIP-37 event found for pubkey:', pubkeyToCheck);
      
      setState(prevState => ({
        ...prevState,
        nip37DomainMismatch: true,
        noNip37EventFound: true
      }));
      
      updateExtensionBadge(true, currentDomain);
    }
  };

  /**
   * Processes a NIP-37 event to check domain verification
   */
  const processNip37Event = async (
    addressingEvent: NostrEvent,
    currentDomain: string,
    protocol: string
  ) => {
    // NIP-37 events use "clearnet" tags with domain in position [1] and protocol in position [2]
    const clearnetTags = addressingEvent.tags.filter(tag => 
      tag[0] === 'clearnet' && !!tag[1] && !!tag[2]
    );
    
    // Check if any tag matches both domain and protocol
    const domainFound = clearnetTags.some(tag => 
      tag[1] === currentDomain && 
      tag[2] === protocol
    );
    
    // Extract all domains from the clearnet tags
    const domains = clearnetTags.map(tag => ({
      domain: tag[1],
      protocol: tag[2]
    }));
    
    // Update state with domains and verification status
    setState(prevState => ({
      ...prevState,
      nip37DomainMismatch: !domainFound,
      nip37Domains: domains
    }));
    
    updateExtensionBadge(!domainFound, currentDomain);
  };

  /**
   * Updates the extension badge based on verification status
   */
  const updateExtensionBadge = (showWarning: boolean, currentDomain: string) => {
    if (showWarning) {
      // Set a warning badge on the extension icon
      chrome.action.setBadgeText({ text: '!' });
      chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
      
      // Send a message to the background script
      try {
        chrome.runtime.sendMessage({ 
          action: 'domainMismatch',
          domain: currentDomain
        });
      } catch (error) {
        console.error('Failed to send message to background script:', error);
      }
    } else {
      // Clear any existing badge
      chrome.action.setBadgeText({ text: '' });
    }
  };

  return state;
} 