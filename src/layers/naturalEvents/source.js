import { normalizeNaturalEventsSnapshot } from './records.js';
const API_URL = 'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=30';
/** Request and validate a complete EONET snapshot before it replaces displayed events. */
export function createEonetNaturalEventsSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
  url = API_URL,
} = {}) {
  return {
    async getSnapshot({ signal } = {}) {
      signal?.throwIfAborted();
      const response = await fetchImpl(url, { signal });
      if (!response.ok) throw new Error(`EONET HTTP ${response.status}`);
      const payload = await response.json();
      signal?.throwIfAborted();
      const rows = normalizeNaturalEventsSnapshot(payload);
      if (!rows) throw new Error('Malformed EONET response');
      return rows;
    },
  };
}
