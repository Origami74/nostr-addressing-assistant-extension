/**
 * Content script for Nostr Addressing Extension
 * Runs automatically when a website loads to verify Nostr addressing information
 */

// Wait for the DOM to be fully loaded
document.addEventListener('DOMContentLoaded', () => {
  // Extract the nostr-pubkey meta tag
  const metaTag = document.querySelector('meta[name="nostr-pubkey"]');
  if (!metaTag) return;
  
  const pubkey = metaTag.getAttribute('content');
  const relays = metaTag.getAttribute('relays') || metaTag.getAttribute('rel');
  
  if (!pubkey) return;
  
  // Send the extracted information to the background script for processing
  chrome.runtime.sendMessage({
    action: 'checkDomain',
    data: {
      domain: window.location.hostname,
      pubkey,
      relays,
      protocol: window.location.protocol.replace(':', '')
    }
  }, (response) => {
    console.log('Domain check response:', response);
  });
}); 