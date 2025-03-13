import React, { useState } from 'react';
import type { NostrAddressingState } from '../hooks/useNostrAddressing';
// @ts-ignore
import rugpullImage from '../assets/rugpull2.webp';
import { saveDomainInfo } from '../services/storage';

interface NostrAddressingInfoProps {
  state: NostrAddressingState;
}

/**
 * Component to display Nostr addressing information for a domain
 */
export const NostrAddressingInfo: React.FC<NostrAddressingInfoProps> = ({ state }) => {
  const {
    domain,
    pubkey,
    relays,
    isValidPubkey,
    savedInfo,
    pubkeyMismatch,
    isNewDomain,
    relaysUpdated,
    nip37DomainMismatch,
    noNip37EventFound,
    nip37Domains
  } = state;

  // Local state to track user decisions
  const [keptOldPubkey, setKeptOldPubkey] = useState(false);
  const [trustedNewPubkey, setTrustedNewPubkey] = useState(false);

  // Shortening display format for pubkey
  const displayPubkey = (key: string) => {
    if (key === 'No Nostr pubkey found' || key === 'Error accessing page content') {
      return key;
    }
    if (key.includes(' (saved)')) {
      return `${key.substring(0, 8)}...${key.substring(key.length - 8)} (saved)`;
    }
    return `${key.substring(0, 8)}...${key.substring(key.length - 8)}`;
  };

  // Determine status coloring
  const getStatusColor = () => {
    if (nip37DomainMismatch) {
      return noNip37EventFound ? '#f59e0b' : '#ef4444'; // amber for unverified, red for revoked
    }
    return '#10b981'; // green for verified
  };

  const getStatusText = () => {
    if (nip37DomainMismatch) {
      return noNip37EventFound ? 'UNVERIFIED' : 'REVOKED';
    }
    return 'VERIFIED';
  };

  const getStatusIcon = () => {
    if (nip37DomainMismatch) {
      return noNip37EventFound ? 'ⓘ' : '⚠️';
    }
    return '✓';
  };

  // Handler for keeping the old pubkey
  const handleKeepOldPubkey = () => {
    if (savedInfo) {
      // Save the domain with the old pubkey that was previously trusted
      saveDomainInfo(domain, savedInfo.pubkey, savedInfo.relays);
      setKeptOldPubkey(true);
      setTrustedNewPubkey(false);
    }
  };

  // Handler for trusting the new pubkey
  const handleTrustNewPubkey = () => {
    // Save the domain with the new pubkey
    saveDomainInfo(domain, pubkey, relays);
    setTrustedNewPubkey(true);
    setKeptOldPubkey(false);
  };

  // Determine which pubkey to display
  const displayedPubkey = keptOldPubkey && savedInfo ? savedInfo.pubkey : pubkey;
  
  return (
    <div style={{ width: '300px', maxHeight: '450px', padding: '0.75rem', overflow: 'auto' }}>
      <div style={{
        padding: '0.75rem',
        borderRadius: '0.5rem',
        border: `1px solid ${getStatusColor()}`,
        background: 'white',
        marginBottom: '0.75rem'
      }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          marginBottom: '0.5rem'
        }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Nostr Addressing</h2>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: getStatusColor(),
            color: 'white',
            fontWeight: '600',
            fontSize: '0.65rem',
            padding: '0.25rem 0.5rem',
            borderRadius: '1rem'
          }}>
            {getStatusText()} {getStatusIcon()}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
          {/* When domain is revoked, show small rugpull image */}
          {nip37DomainMismatch && !noNip37EventFound && (
            <img 
              src={rugpullImage} 
              alt="Domain revoked" 
              style={{ 
                width: '60px', 
                height: '60px',
                objectFit: 'cover',
                borderRadius: '0.25rem',
                border: '1px solid #ef4444',
              }} 
            />
          )}
          
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ 
              fontSize: '0.8rem', 
              fontWeight: 500, 
              color: '#4b5563',
              marginBottom: '0.25rem'
            }}>
              Domain:
            </div>
            <div style={{ 
              fontSize: '0.8rem', 
              fontWeight: 600,
              color: getStatusColor(),
              wordBreak: 'break-all',
              marginBottom: '0.5rem'
            }}>
              {domain}
            </div>

            <div style={{ 
              fontSize: '0.8rem', 
              fontWeight: 500, 
              color: '#4b5563',
              marginBottom: '0.25rem'
            }}>
              Pubkey:
            </div>
            <div style={{ 
              display: 'flex',
              alignItems: 'center',
              fontSize: '0.8rem', 
              color: isValidPubkey ? (pubkeyMismatch && !keptOldPubkey && !trustedNewPubkey ? '#f59e0b' : '#10b981') : '#ef4444', 
              wordBreak: 'break-all',
              marginBottom: '0.25rem'
            }}>
              {displayPubkey(displayedPubkey)}
              {isValidPubkey && <span style={{ marginLeft: '0.25rem' }}>{pubkeyMismatch && !keptOldPubkey && !trustedNewPubkey ? '⚠️' : '✓'}</span>}
              {pubkeyMismatch && !keptOldPubkey && !trustedNewPubkey && (
                <span style={{ 
                  marginLeft: '0.25rem', 
                  fontSize: '0.65rem',
                  backgroundColor: '#fff7ed',
                  color: '#f59e0b',
                  padding: '0.125rem 0.25rem',
                  borderRadius: '0.25rem',
                  border: '1px solid #f59e0b'
                }}>
                  MISMATCH
                </span>
              )}
              {keptOldPubkey && (
                <span style={{ 
                  marginLeft: '0.25rem', 
                  fontSize: '0.65rem',
                  backgroundColor: '#f0fdf4',
                  color: '#10b981',
                  padding: '0.125rem 0.25rem',
                  borderRadius: '0.25rem',
                  border: '1px solid #10b981'
                }}>
                  TRUSTED (PREVIOUS)
                </span>
              )}
              {trustedNewPubkey && (
                <span style={{ 
                  marginLeft: '0.25rem', 
                  fontSize: '0.65rem',
                  backgroundColor: '#f0fdf4',
                  color: '#10b981',
                  padding: '0.125rem 0.25rem',
                  borderRadius: '0.25rem',
                  border: '1px solid #10b981'
                }}>
                  TRUSTED (NEW)
                </span>
              )}
            </div>

            {isValidPubkey && (
              <div style={{ marginTop: '0.25rem' }}>
                {(isNewDomain || relaysUpdated || trustedNewPubkey) && (
                  <div style={{ 
                    fontSize: '0.65rem', 
                    color: '#10b981',
                    marginBottom: '0.25rem'
                  }}>
                    {isNewDomain && !trustedNewPubkey && '✓ First time seeing this domain'}
                    {relaysUpdated && !isNewDomain && !pubkeyMismatch && !trustedNewPubkey && '✓ Relay info updated'}
                    {trustedNewPubkey && '✓ Pubkey updated for this domain'}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Warning panel for mismatch */}
      {(nip37DomainMismatch || (pubkeyMismatch && !keptOldPubkey && !trustedNewPubkey)) && (
        <div style={{
          padding: '0.5rem',
          borderRadius: '0.5rem',
          border: `1px solid ${pubkeyMismatch ? '#dc2626' : (nip37DomainMismatch ? (noNip37EventFound ? '#d97706' : '#ef4444') : '#f59e0b')}`,
          backgroundColor: pubkeyMismatch ? '#fef2f2' : (nip37DomainMismatch ? (noNip37EventFound ? '#fffbeb' : '#fef2f2') : '#fff7ed'),
          marginBottom: '0.75rem',
          fontSize: '0.7rem'
        }}>
          <div style={{ 
            fontWeight: 600, 
            color: pubkeyMismatch ? '#b91c1c' : (nip37DomainMismatch ? (noNip37EventFound ? '#92400e' : '#b91c1c') : '#b45309'),
            marginBottom: '0.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem'
          }}>
            {pubkeyMismatch && !keptOldPubkey && !trustedNewPubkey && (
              <>
                <span style={{ fontSize: '0.9rem' }}>⚠️</span> 
                <span>WARNING: Pubkey mismatch detected!</span>
              </>
            )}
            {nip37DomainMismatch && !pubkeyMismatch && (
              noNip37EventFound 
                ? <><span>ⓘ</span> No NIP-37 verification found</> 
                : <><span>⚠️</span> Domain not in NIP-37 verification</>
            )}
          </div>
          
          {pubkeyMismatch && !keptOldPubkey && !trustedNewPubkey ? (
            <div style={{ color: '#b91c1c' }}>
              <p style={{ margin: '0 0 0.5rem 0', lineHeight: '1.3' }}>
                <strong>Security risk:</strong> This domain previously had a different pubkey. This could indicate site impersonation or a legitimate key rotation.
              </p>
              
              <div style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '0.5rem',
                marginTop: '0.75rem',
                fontSize: '0.75rem'
              }}>
                <button 
                  onClick={handleKeepOldPubkey}
                  style={{
                    backgroundColor: '#10b981', // Changed to green for the safer option
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.25rem',
                    padding: '0.5rem 0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.25rem'
                  }}
                >
                  <span>🔒</span> Keep using previously known pubkey
                </button>
                
                <button 
                  onClick={handleTrustNewPubkey}
                  style={{
                    backgroundColor: '#dc2626', // Changed to red for the riskier option
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.25rem',
                    padding: '0.5rem 0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.25rem'
                  }}
                >
                  <span>⚠️</span> Trust and update to new pubkey
                </button>
              </div>
            </div>
          ) : (
            <div style={{ 
              color: nip37DomainMismatch ? (noNip37EventFound ? '#92400e' : '#b91c1c') : '#b45309',
              lineHeight: '1.3'
            }}>
              {nip37DomainMismatch && !pubkeyMismatch && (
                noNip37EventFound 
                  ? 'The owner of this pubkey should publish a domain verification record.' 
                  : 'This domain is not listed in the pubkey owner\'s NIP-37 verification record.'
              )}
            </div>
          )}
        </div>
      )}

      {/* User decision confirmation */}
      {(keptOldPubkey || trustedNewPubkey) && (
        <div style={{
          padding: '0.5rem',
          borderRadius: '0.5rem',
          border: '1px solid #10b981',
          backgroundColor: '#f0fdf4',
          marginBottom: '0.75rem',
          fontSize: '0.7rem',
          color: '#065f46'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontWeight: 600 }}>
            <span>✓</span> 
            <span>
              {keptOldPubkey 
                ? 'Using previously trusted pubkey' 
                : 'Updated to the new pubkey'}
            </span>
          </div>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.65rem' }}>
            {keptOldPubkey 
              ? 'You chose to continue using the previously known pubkey for this domain.' 
              : 'You chose to trust and update to the new pubkey for this domain.'}
          </p>
        </div>
      )}

      {/* Collapsible sections */}
      <div style={{ marginBottom: '0.75rem' }}>
        {/* Domains section */}
        {(nip37Domains.length > 0 || nip37DomainMismatch) && (
          <details open={false}>
            <summary style={{ 
              fontSize: '0.8rem', 
              fontWeight: 600, 
              cursor: 'pointer',
              padding: '0.5rem',
              backgroundColor: '#f9fafb',
              borderRadius: '0.25rem'
            }}>
              Domains associated with this pubkey
            </summary>
            <div style={{ 
              padding: '0.5rem',
              fontSize: '0.7rem',
              border: '1px solid #e5e7eb',
              borderRadius: '0 0 0.25rem 0.25rem',
              marginTop: '1px',
              maxHeight: '100px',
              overflow: 'auto'
            }}>
              <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                {nip37DomainMismatch && (
                  <li style={{ 
                    marginBottom: '0.25rem', 
                    color: noNip37EventFound ? '#b45309' : '#ef4444',
                    fontWeight: 600
                  }}>
                    {domain} - {noNip37EventFound ? 'UNVERIFIED' : 'REVOKED'} {noNip37EventFound ? 'ⓘ' : '⚠️'}
                  </li>
                )}
                
                {nip37Domains.map(({ domain: domainItem, protocol }, index) => (
                  <li key={index} style={{ 
                    marginBottom: '0.125rem', 
                    color: domainItem === domain ? '#10b981' : '#4b5563',
                    fontWeight: domainItem === domain ? 600 : 400
                  }}>
                    {domainItem} ({protocol})
                    {domainItem === domain && <span style={{ marginLeft: '0.25rem' }}>✓</span>}
                  </li>
                ))}
              </ul>
            </div>
          </details>
        )}

        {/* Relays section */}
        {isValidPubkey && relays.length > 0 && (
          <details open={false} style={{ marginTop: '0.5rem' }}>
            <summary style={{ 
              fontSize: '0.8rem', 
              fontWeight: 600, 
              cursor: 'pointer',
              padding: '0.5rem',
              backgroundColor: '#f9fafb',
              borderRadius: '0.25rem'
            }}>
              Suggested Relays ({relays.length})
            </summary>
            <div style={{ 
              padding: '0.5rem',
              fontSize: '0.7rem',
              border: '1px solid #e5e7eb',
              borderRadius: '0 0 0.25rem 0.25rem',
              marginTop: '1px',
              maxHeight: '100px',
              overflow: 'auto'
            }}>
              <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                {relays.map((relay, index) => (
                  <li key={index} style={{ marginBottom: '0.125rem', color: '#4b5563' }}>
                    {relay}
                  </li>
                ))}
              </ul>
            </div>
          </details>
        )}

        {/* Previous pubkey info section */}
        {pubkeyMismatch && savedInfo && (
          <details open={false} style={{ marginTop: '0.5rem' }}>
            <summary style={{ 
              fontSize: '0.8rem', 
              fontWeight: 600, 
              cursor: 'pointer',
              padding: '0.5rem',
              backgroundColor: '#f9fafb',
              borderRadius: '0.25rem',
              color: keptOldPubkey ? '#10b981' : '#f59e0b'
            }}>
              Previously known pubkey
            </summary>
            <div style={{ 
              padding: '0.5rem',
              fontSize: '0.7rem',
              border: '1px solid #e5e7eb',
              borderRadius: '0 0 0.25rem 0.25rem',
              marginTop: '1px',
              maxHeight: '100px',
              overflow: 'auto'
            }}>
              <div style={{ wordBreak: 'break-all', color: '#4b5563', marginBottom: '0.5rem' }}>
                {savedInfo.pubkey}
              </div>
              
              {savedInfo.relays && savedInfo.relays.length > 0 && (
                <>
                  <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
                    Previously known relays:
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                    {savedInfo.relays.map((relay, index) => (
                      <li key={index} style={{ marginBottom: '0.125rem', color: '#4b5563' }}>
                        {relay}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </details>
        )}
      </div>

      {/* Full pubkey display */}
      <div style={{ 
        fontSize: '0.65rem', 
        color: '#6b7280',
        padding: '0.5rem',
        borderRadius: '0.25rem',
        backgroundColor: '#f9fafb',
        wordBreak: 'break-all'
      }}>
        <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Full Pubkey:</div>
        {displayedPubkey}
      </div>
    </div>
  );
}; 