import "./index.css";
import { useEffect, useState } from 'react';
import { NPool, NRelay1, type NostrEvent } from '@nostrify/nostrify';
// @ts-ignore
import rugpullImage from './assets/rugpull2.webp';
// Validation functions
function isValidHexPubkey(pubkey: string): boolean {
  // Nostr hex pubkeys are 64 characters long (32 bytes) and contain only hex characters
  const hexRegex = /^[0-9a-f]{64}$/i;
  return hexRegex.test(pubkey);
}

function isValidRelayUrl(url: string): boolean {
  try {
    // Check if it's a valid URL and uses the wss:// protocol
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === 'wss:' || parsedUrl.protocol === 'ws:';
  } catch (e) {
    return false;
  }
}

function parseRelays(relayString: string | null): string[] {
  if (!relayString) return [];
  
  // Split by commas and remove whitespace
  return relayString
    .split(',')
    .map(relay => relay.trim())
    .filter(relay => relay && isValidRelayUrl(relay));
}

function generateColorFromDomain(domain: string): string {
  // Simple hash function to generate a color from the domain
  let hash = 0;
  for (let i = 0; i < domain.length; i++) {
    hash = domain.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // Convert hash to HSL color
  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, 70%, 50%)`;
}

interface DomainInfo {
  pubkey: string;
  relays: string[];
}

// Storage functions
function saveDomainInfo(domain: string, pubkey: string, relays: string[] = []) {
  try {
    // Get existing saved pairs
    const savedInfoJSON = localStorage.getItem('nostrDomainInfo') || '{}';
    const savedInfo = JSON.parse(savedInfoJSON);
    
    // Add or update the domain info
    savedInfo[domain] = {
      pubkey,
      relays
    };
    
    // Save back to localStorage
    localStorage.setItem('nostrDomainInfo', JSON.stringify(savedInfo));
    return true;
  } catch (error) {
    console.error('Error saving domain info:', error);
    return false;
  }
}

function getSavedInfoForDomain(domain: string): DomainInfo | null {
  try {
    // Get existing saved pairs
    const savedInfoJSON = localStorage.getItem('nostrDomainInfo') || '{}';
    const savedInfo = JSON.parse(savedInfoJSON);
    
    // Return the info for this domain or null if not found
    return savedInfo[domain] || null;
  } catch (error) {
    console.error('Error getting saved info for domain:', error);
    return null;
  }
}

async function fetchLatestNip37Event(pubkey: string, relays: string[]): Promise<NostrEvent | undefined> {
  console.log('fetchLatestNip37Event', pubkey, "from relays", relays);
  const pool = new NPool({
    open(url) {
        return new NRelay1(url);
    },
    reqRouter: async (filters) => {
        return new Map(relays.map((relay) => {
            return [relay, filters];
        }));
    },
    eventRouter: async event => {
        return relays;
    },
  });

  const filter = {
    kinds: [11111],
    authors: [pubkey],
    since: Math.floor(Date.now() / 1000) - (3 * 30 * 24 * 60 * 60), // 3 months ago
  }

  const events: NostrEvent[] = [];
  for await (const msg of pool.req([filter])) {
    if (msg[0] === 'EVENT') {
      const event = msg[2];
      if(events.find(e => e.id === event.id) === undefined) {
        console.log('event', event);
        events.push(event);
      }
    };
    if (msg[0] === 'EOSE') break;
  }

  // Handle empty events array
  if (events.length === 0) {
    console.log('No NIP-37 events found for pubkey:', pubkey);
    return undefined;
  }

  // With at least one event, we can safely use reduce
  const latestEvent = events.reduce((prev, next) => {
    console.log('prev', prev);
    console.log('next', next);

    if(next.created_at > prev.created_at) {
      return next;
    }

    return prev;
  });

  return latestEvent;
}

export function App() {
  const [domain, setDomain] = useState<string>('');
  const [color, setColor] = useState<string>('');
  const [pubkey, setPubkey] = useState<string>('');
  const [relays, setRelays] = useState<string[]>([]);
  const [isValidPubkey, setIsValidPubkey] = useState<boolean>(false);
  const [savedInfo, setSavedInfo] = useState<DomainInfo | null>(null);
  const [pubkeyMismatch, setPubkeyMismatch] = useState<boolean>(false);
  const [isNewDomain, setIsNewDomain] = useState<boolean>(false);
  const [relaysUpdated, setRelaysUpdated] = useState<boolean>(false);
  const [nip37DomainMismatch, setNip37DomainMismatch] = useState<boolean>(false);
  const [noNip37EventFound, setNoNip37EventFound] = useState<boolean>(false);
  const [nip37Domains, setNip37Domains] = useState<Array<{domain: string, protocol: string}>>([]);

  useEffect(() => {
    // Get the current tab's URL and meta tag
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id && tabs[0]?.url) {
        const url = new URL(tabs[0].url);
        const currentDomain = url.hostname;
        setDomain(currentDomain);
        setColor(generateColorFromDomain(currentDomain));
        
        // Check if we have saved info for this domain
        const previousInfo = getSavedInfoForDomain(currentDomain);
        setSavedInfo(previousInfo);
        
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
              setPubkey(extractedPubkey);
              
              try {
                // Check if it's a valid hex pubkey
                const isValid = isValidHexPubkey(extractedPubkey);
                setIsValidPubkey(isValid);
                
                // Parse relays
                const parsedRelays = parseRelays(extractedRelays);
                setRelays(parsedRelays);
                
                // If valid pubkey, check against saved info
                if (isValid) {
                  if (previousInfo === null) {
                    // First time seeing this domain with a valid pubkey
                    setIsNewDomain(true);
                    saveDomainInfo(currentDomain, extractedPubkey, parsedRelays);
                  } else if (previousInfo.pubkey !== extractedPubkey) {
                    // We have a different pubkey than what we've seen before
                    setPubkeyMismatch(true);
                  } else {
                    // Pubkey matches, always update relays (they don't have to match)
                    // Only show update notification if relays have actually changed
                    if (JSON.stringify(parsedRelays) !== JSON.stringify(previousInfo.relays)) {
                      saveDomainInfo(currentDomain, extractedPubkey, parsedRelays);
                      setRelaysUpdated(true);
                    }
                  }


                  // request 11111 events from the new pubkey
                  const addressingEvent = await fetchLatestNip37Event(previousInfo.pubkey, parsedRelays);
                  console.log('latest:', addressingEvent);
                  
                  // Check if we were able to retrieve a NIP-37 event
                  if (addressingEvent) {
                    // NIP-37 events use "clearnet" tags with domain in position [1] and protocol in position [2]
                    const clearnetTags = addressingEvent.tags.filter(tag => 
                      tag[0] === 'clearnet' && !!tag[1] && !!tag[2]
                    );
                    
                    // Get protocol from current URL (without the ":" part)
                    const protocol = url.protocol.replace(':', '');
                    
                    // Check if any tag matches both domain and protocol
                    const domainFound = clearnetTags.some(tag => 
                      tag[1] === currentDomain && 
                      tag[2] === protocol
                    );
                    
                    // Set mismatch state if domain+protocol not found in the event
                    if (!domainFound) {
                      setNip37DomainMismatch(true);
                    }
                    
                    // Extract all domains from the clearnet tags
                    const domains = clearnetTags.map(tag => ({
                      domain: tag[1],
                      protocol: tag[2]
                    }));
                    
                    // Store all domains in state
                    setNip37Domains(domains);
                    
                    // Update extension icon to show warning if domain not found
                    if (!domainFound) {
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
                  } else {
                    // No NIP-37 event found for this pubkey
                    console.log('No NIP-37 event found for pubkey:', previousInfo.pubkey);
                    setNip37DomainMismatch(true);
                    setNoNip37EventFound(true);
                    
                    // Set warning badge
                    chrome.action.setBadgeText({ text: '!' });
                    chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
                    
                    // Try to send a message to the background script
                    try {
                      chrome.runtime.sendMessage({ 
                        action: 'domainMismatch',
                        domain: currentDomain
                      });
                    } catch (error) {
                      console.error('Failed to send message to background script:', error);
                    }
                  }
                }
              } catch (error) {
                console.error('Error validating pubkey:', error);
                setIsValidPubkey(false);
              }
            } else {
              setPubkey('No Nostr pubkey found');
              setIsValidPubkey(false);
            }
          } else {
            setPubkey('No Nostr pubkey found');
            setIsValidPubkey(false);
          }
        }).catch(error => {
          console.error('Error executing script:', error);
          setPubkey('Error accessing page content');
          setIsValidPubkey(false);
        });
      }
    });
  }, []);

  return (
    
    <div style={{ width: '300px', padding: '1rem' }}>
      {/* Display warning image when domain mismatch is detected */}
      {nip37DomainMismatch && (
        <div style={{ 
          marginBottom: '1rem', 
          textAlign: 'center',
          position: 'relative',
        }}>
          {/* For revoked domains, show the cartoon with red header */}
          {!noNip37EventFound ? (
            <>
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                textAlign: 'center',
                backgroundColor: 'rgba(239, 68, 68, 0.9)', // Red for revoked
                color: 'white',
                fontWeight: '600',
                padding: '0.375rem 0',
                borderTopLeftRadius: '0.5rem',
                borderTopRightRadius: '0.5rem',
                fontSize: '0.75rem',
                zIndex: 10
              }}>
                DOMAIN RUGGED
              </div>
              <img 
                src={rugpullImage} 
                alt="Error: Domain revoked" 
                style={{ 
                  maxWidth: '100%', 
                  borderRadius: '0.5rem',
                  border: '2px solid #ef4444',
                  marginTop: '1.25rem'
                }} 
              />
            </>
          ) : (
            /* For unverified domains, show a cleaner banner-style message */
            <div style={{
              width: '100%',
              borderRadius: '0.5rem',
              border: '2px solid #f59e0b',
              backgroundColor: '#fff7ed',
              overflow: 'hidden',
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
            }}>
              <div style={{
                backgroundColor: '#f59e0b',
                color: 'white',
                fontWeight: '600',
                padding: '0.375rem 0',
                textAlign: 'center',
                fontSize: '0.75rem'
              }}>
                DOMAIN UNVERIFIED
              </div>
              <div style={{
                padding: '0.75rem',
                color: '#92400e',
                fontSize: '0.75rem',
                fontWeight: 500,
                textAlign: 'center',
                lineHeight: '1.5'
              }}>
                This domain has a valid Nostr pubkey but the owner has not published a NIP-37 verification record yet.
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ 
        padding: '1rem',
        borderRadius: '0.5rem',
        border: '1px solid #e5e7eb',
        background: 'white'
      }}>

        

        <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Nostr Addressing Assistant</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        

          {/* Display domains list if there are NIP-37 domains or if there's a mismatch */}
          {(nip37Domains.length > 0 || nip37DomainMismatch) && (
          <div style={{ marginTop: '0.5rem' }}>
            <p style={{ fontSize: '0.75rem', fontWeight: 500 }}>Domains associated with this pubkey:</p>
            <ul style={{ fontSize: '0.75rem', marginTop: '0.25rem', paddingLeft: '1rem' }}>
              {/* Show current domain at top with appropriate warning styling */}
              {nip37DomainMismatch && (
                <li style={{ 
                  marginBottom: '0.25rem', 
                  wordBreak: 'break-all',
                  color: noNip37EventFound ? '#b45309' : '#ef4444', // Amber text for unverified, red for revoked
                  fontWeight: 600,
                  borderBottom: noNip37EventFound 
                    ? '1px solid #fcd34d' // Amber border for unverified
                    : '1px solid #fca5a5', // Red border for revoked
                  paddingBottom: '0.25rem',
                }}>
                  {domain} - {noNip37EventFound ? 'UNVERIFIED' : 'REVOKED'} {noNip37EventFound ? 'ⓘ' : '⚠️'}
                </li>
              )}
              
              {/* Show all domains from the NIP-37 event */}
              {nip37Domains.map(({ domain: domainItem, protocol }, index) => (
                <li key={index} style={{ 
                  marginBottom: '0.125rem', 
                  wordBreak: 'break-all',
                  color: domainItem === domain ? '#10b981' : '#4b5563',
                  fontWeight: domainItem === domain ? 600 : 400
                }}>
                  {domainItem} ({protocol})
                  {domainItem === domain && (
                    <span style={{ marginLeft: '0.25rem' }}>✓</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}



          <div>
            <p style={{ fontSize: '0.875rem', fontWeight: 500 }}>Nostr Pubkey:</p>
            <p style={{ 
              fontSize: '0.875rem', 
              color: isValidPubkey ? (pubkeyMismatch ? '#f59e0b' : '#10b981') : '#ef4444', 
              wordBreak: 'break-all'
            }}>
              {pubkey} {isValidPubkey ? (pubkeyMismatch ? '⚠️' : '✓') : pubkey !== 'No Nostr pubkey found' && pubkey !== 'Error accessing page content' ? '✗' : ''}
            </p>
            {isValidPubkey && relays.length > 0 && (
              <div style={{ marginTop: '0.5rem' }}>
                <p style={{ fontSize: '0.75rem', fontWeight: 500 }}>Suggested Relays:</p>
                <ul style={{ fontSize: '0.75rem', marginTop: '0.25rem', paddingLeft: '1rem' }}>
                  {relays.map((relay, index) => (
                    <li key={index} style={{ marginBottom: '0.125rem', color: '#4b5563', wordBreak: 'break-all' }}>
                      {relay}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {isValidPubkey && isNewDomain && (
              <p style={{ fontSize: '0.75rem', color: '#10b981', marginTop: '0.25rem' }}>
                ✓ First time seeing this domain, information saved.
              </p>
            )}
            {isValidPubkey && relaysUpdated && !isNewDomain && !pubkeyMismatch && (
              <p style={{ fontSize: '0.75rem', color: '#10b981', marginTop: '0.25rem' }}>
                ✓ Relay information updated.
              </p>
            )}

            
            {pubkeyMismatch && (
              <div style={{ marginTop: '0.5rem' }}>
                <p style={{ fontSize: '0.75rem', color: '#f59e0b', fontWeight: 500 }}>
                  ⚠️ Warning: Pubkey mismatch!
                </p>
                <p style={{ fontSize: '0.75rem', color: '#4b5563' }}>
                  Previously known pubkey:
                </p>
                <p style={{ fontSize: '0.75rem', color: '#4b5563', wordBreak: 'break-all' }}>
                  {savedInfo?.pubkey}
                </p>
                {savedInfo?.relays && savedInfo.relays.length > 0 && (
                  <>
                    <p style={{ fontSize: '0.75rem', color: '#4b5563', marginTop: '0.25rem' }}>
                      Previously known relays:
                    </p>
                    <ul style={{ fontSize: '0.75rem', paddingLeft: '1rem' }}>
                      {savedInfo.relays.map((relay, index) => (
                        <li key={index} style={{ marginBottom: '0.125rem', color: '#4b5563', wordBreak: 'break-all' }}>
                          {relay}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
            
            {nip37DomainMismatch && (
              <div style={{ 
                marginTop: '0.5rem', 
                padding: '0.5rem', 
                backgroundColor: noNip37EventFound ? '#fffbeb' : '#fef3c7', // Lighter amber for unverified
                borderRadius: '0.25rem', 
                border: noNip37EventFound ? '1px solid #d97706' : '1px solid #f59e0b' // Different border color
              }}>
                <p style={{ 
                  fontSize: '0.75rem', 
                  color: noNip37EventFound ? '#92400e' : '#b45309', 
                  fontWeight: 500 
                }}>
                  {noNip37EventFound ? 'ⓘ Note:' : '⚠️ Warning:'} {noNip37EventFound ? 'No NIP-37 record found' : 'Domain not verified in NIP-37 record!'}
                </p>
                {noNip37EventFound ? (
                  <>
                    <p style={{ fontSize: '0.75rem', color: '#92400e' }}>
                      No NIP-37 (kind 11111) event was found for this pubkey.
                    </p>
                    <p style={{ fontSize: '0.75rem', color: '#92400e', marginTop: '0.25rem' }}>
                      The owner of this pubkey should publish a domain verification record for added security.
                    </p>
                  </>
                ) : (
                  <>
                    <p style={{ fontSize: '0.75rem', color: '#92400e' }}>
                      The current domain ({domain}) with its protocol is not listed in the latest NIP-37 (kind 11111) event for this pubkey.
                    </p>
                    <p style={{ fontSize: '0.75rem', color: '#92400e', marginTop: '0.25rem' }}>
                      This could indicate site impersonation or that the pubkey owner has not updated their NIP-37 addressing record.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
