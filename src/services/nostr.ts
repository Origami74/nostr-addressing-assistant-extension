import { NPool, NRelay1, type NostrEvent } from '@nostrify/nostrify';

/**
 * Fetches the latest NIP-37 (kind 11111) event for a given pubkey from specified relays
 * @param pubkey The Nostr public key to fetch events for
 * @param relays Array of relay URLs to fetch from
 * @returns The latest NIP-37 event or undefined if none found
 */
export async function fetchLatestNip37Event(pubkey: string, relays: string[]): Promise<NostrEvent | undefined> {
  console.log('fetchLatestNip37Event', pubkey, "from relays", relays);
  
  // Skip if no relays provided
  if (relays.length === 0) {
    console.log('No relays provided, skipping fetch');
    return undefined;
  }
  
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
  try {
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
  } catch (error) {
    console.error('Error fetching NIP-37 events:', error);
  }

  // Handle empty events array
  if (events.length === 0) {
    console.log('No NIP-37 events found for pubkey:', pubkey);
    return undefined;
  }

  // With at least one event, we can safely use reduce
  const latestEvent = events.reduce((prev, next) => {
    if(next.created_at > prev.created_at) {
      return next;
    }
    return prev;
  });

  return latestEvent;
} 