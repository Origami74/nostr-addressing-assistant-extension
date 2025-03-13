import "./index.css";
import { useEffect, useState } from 'react';

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
        }).then(results => {
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
      <div style={{ 
        padding: '1rem',
        borderRadius: '0.5rem',
        border: '1px solid #e5e7eb',
        background: 'white'
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Nostr Addressing</h2>
          <div>
            <p style={{ fontSize: '0.875rem', fontWeight: 500 }}>Domain:</p>
            <p style={{ fontSize: '0.875rem', color: '#4b5563', wordBreak: 'break-all' }}>{domain}</p>
          </div>
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
          </div>
          <div 
            style={{
              width: '100%',
              height: '6rem',
              borderRadius: '0.5rem',
              backgroundColor: color,
              animation: 'pulse 2s infinite',
            }}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
