import { useEffect, useState } from 'react';
import type { DomainInfo, Nip37Domain } from '../types/nostr';
import { isValidHexPubkey, parseRelays } from '../utils/validation';
import { generateColorFromDomain } from '../utils/ui';
import { getSavedInfoForDomain, saveDomainInfo, getDomainsForPubkey } from '../services/storage';
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
  extractedPubkey?: string;
  extractedRelays?: string[];
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
    initializeNostrAddressing();
  }, []);

  /**
   * Initializes the Nostr addressing process by fetching the current tab URL
   * and checking for saved domain information
   */
  const initializeNostrAddressing = () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]?.id || !tabs[0]?.url) return;

      const url = new URL(tabs[0].url);
      const currentDomain = url.hostname;
      const protocol = url.protocol.replace(':', '');
      
      // Update initial state with domain info
      updateStateWithDomain(currentDomain);
      
      // Check for saved information for this domain
      const previousInfo = getSavedInfoForDomain(currentDomain);
      updateStateWithSavedInfo(previousInfo);
      
      // Extract nostr-pubkey meta tag
      extractPubkeyFromPage(tabs[0].id, currentDomain, previousInfo, protocol);
    });
  };

  /**
   * Updates state with the current domain and color
   */
  const updateStateWithDomain = (domain: string) => {
    setState(prevState => ({
      ...prevState,
      domain,
      color: generateColorFromDomain(domain)
    }));
  };

  /**
   * Updates state with saved domain information
   */
  const updateStateWithSavedInfo = (savedInfo: DomainInfo | null) => {
    setState(prevState => ({
      ...prevState,
      savedInfo
    }));
  };

  /**
   * Executes a script to extract pubkey information from the page
   */
  const extractPubkeyFromPage = (
    tabId: number, 
    currentDomain: string, 
    previousInfo: DomainInfo | null,
    protocol: string
  ) => {
    chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const metaTag = document.querySelector('meta[name="nostr-pubkey"]');
        if (!metaTag) return null;
        
        // Extract pubkey and relays
        const pubkey = metaTag.getAttribute('content');
        const relays = metaTag.getAttribute('relays') || metaTag.getAttribute('rel');
        
        return { pubkey, relays };
      }
    })
    .then(async results => handleScriptResults(results, currentDomain, previousInfo, protocol))
    .catch(error => handleScriptError(error, currentDomain, previousInfo, protocol));
  };

  /**
   * Handles the results from the script execution
   */
  const handleScriptResults = async (
    results: chrome.scripting.InjectionResult[], 
    currentDomain: string, 
    previousInfo: DomainInfo | null,
    protocol: string
  ) => {
    // No results from script
    if (!results || !results[0].result) {
      return handleMissingPubkey(currentDomain, previousInfo, protocol);
    }

    const { pubkey: extractedPubkey, relays: extractedRelays } = results[0].result;
    
    // No pubkey in meta tag
    if (!extractedPubkey) {
      return handleMissingPubkey(currentDomain, previousInfo, protocol);
    }

    try {
      // Parse and validate extracted pubkey and relays
      const extractedPubkeyIsValid = isValidHexPubkey(extractedPubkey);
      const extractedParsedRelays = parseRelays(extractedRelays);

      // Process the extracted data based on whether we have previous info
      if (previousInfo) {
        handleExistingDomain(
          currentDomain, 
          extractedPubkey, 
          extractedParsedRelays, 
          previousInfo, 
          extractedPubkeyIsValid, 
          protocol
        );
      } else {
        handleNewDomain(
          currentDomain, 
          extractedPubkey, 
          extractedParsedRelays, 
          extractedPubkeyIsValid, 
          protocol
        );
      }
    } catch (error) {
      console.error('Error validating pubkey:', error);
      handleValidationError(currentDomain, previousInfo, protocol);
    }
  };

  /**
   * Handles the case when no pubkey is found in the meta tag
   */
  const handleMissingPubkey = async (
    currentDomain: string, 
    previousInfo: DomainInfo | null,
    protocol: string
  ) => {
    if (previousInfo) {
      await fallbackToSavedPubkey(currentDomain, previousInfo, protocol);
    } else {
      setState(prevState => ({
        ...prevState,
        pubkey: 'No Nostr pubkey found',
        isValidPubkey: false
      }));
    }
  };

  /**
   * Handles a domain we've seen before
   */
  const handleExistingDomain = async (
    currentDomain: string,
    extractedPubkey: string,
    extractedParsedRelays: string[],
    previousInfo: DomainInfo,
    isValid: boolean,
    protocol: string
  ) => {
    console.log('handleExistingDomain', {
      currentDomain,
      extractedPubkey,
      previousPubkey: previousInfo.pubkey,
      pubkeyMatch: previousInfo.pubkey === extractedPubkey,
      isValid
    });

    // Check if the pubkey has changed
    if (previousInfo.pubkey !== extractedPubkey) {
      console.log('PUBKEY MISMATCH DETECTED', {
        saved: previousInfo.pubkey,
        extracted: extractedPubkey
      });
      
      // Pubkey mismatch - prioritize previously saved pubkey
      setState(prevState => ({
        ...prevState,
        pubkey: previousInfo.pubkey,
        isValidPubkey: true,
        relays: previousInfo.relays,
        pubkeyMismatch: true,
        extractedPubkey,
        extractedRelays: extractedParsedRelays
      }));
      
      // Check NIP-37 events with the saved pubkey
      await checkNip37Events(
        currentDomain,
        previousInfo.pubkey,
        previousInfo.relays,
        protocol
      );
    } else {
      console.log('Pubkeys match', extractedPubkey);
      // Pubkeys match - update state and check if relays have changed
      setState(prevState => ({
        ...prevState,
        pubkey: extractedPubkey,
        isValidPubkey: isValid,
        relays: extractedParsedRelays,
        pubkeyMismatch: false // Explicitly set to false
      }));
      
      // Update relays if they've changed
      const relaysChanged = JSON.stringify(extractedParsedRelays) !== JSON.stringify(previousInfo.relays);
      if (relaysChanged) {
        console.log('Relays changed', {
          old: previousInfo.relays,
          new: extractedParsedRelays
        });
        
        // Only save if domain is verified in NIP-37 event
        const addressingEvent = await fetchLatestNip37Event(previousInfo.pubkey, previousInfo.relays);
        if (addressingEvent) {
          const clearnetTags = addressingEvent.tags.filter(tag => 
            tag[0] === 'clearnet' && !!tag[1] && !!tag[2]
          );
          const domainFound = clearnetTags.some(tag => 
            tag[1] === currentDomain && 
            tag[2] === protocol
          );
          if (domainFound) {
            console.log('Domain verified in NIP-37, updating relays');
            saveDomainInfo(currentDomain, extractedPubkey, extractedParsedRelays);
            setState(prevState => ({
              ...prevState,
              relaysUpdated: true
            }));
          }
        }
      }
      
      // Check NIP-37 events with saved pubkey
      await checkNip37Events(
        currentDomain,
        previousInfo.pubkey,
        previousInfo.relays,
        protocol
      );
    }
  };

  /**
   * Handles a new domain we haven't seen before
   */
  const handleNewDomain = async (
    currentDomain: string,
    extractedPubkey: string,
    extractedParsedRelays: string[],
    isValid: boolean,
    protocol: string
  ) => {
    console.log('handleNewDomain', {
      currentDomain,
      extractedPubkey,
      isValid
    });
    
    // Check if we have any saved info for this domain
    const savedInfo = getSavedInfoForDomain(currentDomain);
    
    if (savedInfo) {
      console.log('Found saved info for domain', {
        savedPubkey: savedInfo.pubkey,
        extractedPubkey,
        pubkeyMatch: savedInfo.pubkey === extractedPubkey
      });
      
      const hasPubkeyMismatch = savedInfo.pubkey !== extractedPubkey;
      
      // If we have saved info, use that pubkey and relays
      setState(prevState => ({
        ...prevState,
        pubkey: savedInfo.pubkey,
        isValidPubkey: true,
        relays: savedInfo.relays,
        isNewDomain: true,
        pubkeyMismatch: hasPubkeyMismatch,
        extractedPubkey: hasPubkeyMismatch ? extractedPubkey : undefined,
        extractedRelays: hasPubkeyMismatch ? extractedParsedRelays : undefined
      }));
      
      // Check NIP-37 events with the saved pubkey
      await checkNip37Events(
        currentDomain,
        savedInfo.pubkey,
        savedInfo.relays,
        protocol
      );
    } else {
      // Check if this pubkey is already associated with other domains
      const existingDomains = getDomainsForPubkey(extractedPubkey);
      
      if (existingDomains.length > 0) {
        console.log('⚠️ POTENTIAL IMPERSONATION DETECTED!', {
          extractedPubkey,
          currentDomain,
          existingDomains: existingDomains.map(d => d.domain)
        });
        
        // This is an impersonation attempt - use the first existing domain's info
        const firstDomain = existingDomains[0];
        setState(prevState => ({
          ...prevState,
          pubkey: firstDomain.info.pubkey,
          isValidPubkey: true,
          relays: firstDomain.info.relays,
          isNewDomain: true,
          pubkeyMismatch: true, // This is key - mark as mismatch even though it's a "new" domain
          extractedPubkey: extractedPubkey,
          extractedRelays: extractedParsedRelays,
          savedInfo: firstDomain.info // Include saved info so UI can show it
        }));
        
        // Check NIP-37 events with the known pubkey
        await checkNip37Events(
          currentDomain,
          firstDomain.info.pubkey,
          firstDomain.info.relays,
          protocol
        );
      } else {
        console.log('No saved info for domain or pubkey, using extracted pubkey');
        // No saved info, use the extracted pubkey
        setState(prevState => ({
          ...prevState,
          pubkey: extractedPubkey,
          isValidPubkey: isValid,
          relays: extractedParsedRelays,
          isNewDomain: true,
          pubkeyMismatch: false // Explicitly set to false for new domains
        }));
        
        if (isValid) {
          await checkNip37Events(
            currentDomain,
            extractedPubkey,
            extractedParsedRelays,
            protocol
          );
        }
      }
    }
  };

  /**
   * Handles errors during pubkey validation
   */
  const handleValidationError = async (
    currentDomain: string, 
    previousInfo: DomainInfo | null,
    protocol: string
  ) => {
    if (previousInfo) {
      await fallbackToSavedPubkey(currentDomain, previousInfo, protocol);
    } else {
      setState(prevState => ({
        ...prevState,
        isValidPubkey: false
      }));
    }
  };

  /**
   * Handles errors during script execution
   */
  const handleScriptError = (
    error: any, 
    currentDomain: string, 
    previousInfo: DomainInfo | null,
    protocol: string
  ) => {
    console.error('Error executing script:', error);
    
    if (previousInfo) {
      fallbackToSavedPubkey(currentDomain, previousInfo, protocol)
        .catch(err => console.error('Error falling back to saved pubkey:', err));
    } else {
      setState(prevState => ({
        ...prevState,
        pubkey: 'Error accessing page content',
        isValidPubkey: false
      }));
    }
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
    
    // Log verification status for debugging
    console.log('Domain verification check:', {
      currentDomain,
      protocol,
      pubkey: addressingEvent.pubkey,
      domainFound,
      clearnetTags,
      domains
    });
    
    // Get current state to properly update it
    const currentState = await new Promise<NostrAddressingState>(resolve => {
      setState(prevState => {
        resolve(prevState);
        return prevState;
      });
    });

    console.log('Current state before update:', {
      pubkeyMismatch: currentState.pubkeyMismatch,
      nip37DomainMismatch: currentState.nip37DomainMismatch,
      noNip37EventFound: currentState.noNip37EventFound
    });
    
    // Update state with domains and verification status
    setState(prevState => {
      // Store existing pubkey mismatch status to preserve it
      const hasPubkeyMismatch = prevState.pubkeyMismatch;
      
      // If domain is verified, save it to storage
      if (domainFound && !hasPubkeyMismatch) {
        const savedInfo = getSavedInfoForDomain(currentDomain);
        if (!savedInfo) {
          console.log('Saving verified domain info to storage');
          // This is a new domain or pubkey, save it
          saveDomainInfo(currentDomain, prevState.pubkey, prevState.relays);
        }
      }

      console.log('Updating state with verification results', {
        hasPubkeyMismatch,
        domainFound,
        nip37DomainMismatch: !domainFound
      });
      
      return {
        ...prevState,
        nip37DomainMismatch: !domainFound,
        noNip37EventFound: false,
        nip37Domains: domains,
        // Make sure we preserve pubkey mismatch warning
        pubkeyMismatch: hasPubkeyMismatch
      };
    });
    
    // Log domain verification status for debugging
    if (!domainFound) {
      console.log(`Domain verification failed: ${currentDomain} not found in NIP-37 event for this pubkey`);
    }
    
    // Get current state to check pubkey mismatch
    const updatedState = await new Promise<NostrAddressingState>(resolve => {
      setState(prevState => {
        resolve(prevState);
        return prevState;
      });
    });
    
    console.log('Updated state for badge:', {
      pubkeyMismatch: updatedState.pubkeyMismatch,
      nip37DomainMismatch: updatedState.nip37DomainMismatch,
      showWarning: !domainFound || updatedState.pubkeyMismatch
    });

    // Update badge based on domain verification and pubkey mismatch
    updateExtensionBadge(!domainFound || updatedState.pubkeyMismatch, currentDomain);
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