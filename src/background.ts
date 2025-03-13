/**
 * Background script for Nostr Addressing Extension
 * Handles domain mismatch alerts and popup management
 */

// Store information about domains with warnings
const domainsWithWarnings = new Set<string>();

// Listen for messages from the content script or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'domainMismatch') {
    const { domain } = message;
    
    // Store this domain as having a warning
    domainsWithWarnings.add(domain);
    
    // Set a badge to indicate warning
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
    
    // Create a notification to alert the user
    chrome.notifications.create({
      type: 'basic',
      iconUrl: '/dist/logo-kygw735p.svg',
      title: 'Nostr Domain Warning',
      message: `Warning: ${domain} is not in the NIP-37 record for its claimed pubkey!`,
      priority: 2,
      buttons: [{ title: 'View Details' }]
    });
    
    sendResponse({ success: true });
    return true;
  }
  
  return false;
});

// Listen for tab updates to update the badge when navigating between sites
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    try {
      const url = new URL(tab.url);
      const domain = url.hostname;
      
      // Check if this domain has a warning
      if (domainsWithWarnings.has(domain)) {
        // Set warning badge
        chrome.action.setBadgeText({ tabId, text: '!' });
        chrome.action.setBadgeBackgroundColor({ tabId, color: '#ef4444' });
      } else {
        // Clear badge
        chrome.action.setBadgeText({ tabId, text: '' });
      }
    } catch (error) {
      console.error('Error processing tab URL:', error);
    }
  }
});

// Listen for notification clicks
chrome.notifications.onButtonClicked.addListener((notificationId) => {
  // Try to get user's attention when they click on notification
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id) {
      // Focus the window
      chrome.windows.update(tabs[0].windowId, { focused: true });
      
      // Highlight the extension icon
      chrome.action.setBadgeText({ text: '!' });
      chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
    }
  });
}); 