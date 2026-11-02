import { normalizeWorldEventsSnapshot } from './records.js';
/**
 * Request and validate the local GDELT snapshot (the server unpacks the
 * 15-minute export archives) before it replaces displayed events.
 */
export function createGdeltWorldEventsSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
  url = '/api/world-events',
  hours = 6,
} = {}) {
  return {
    async getSnapshot({ signal } = {}) {
      signal?.throwIfAborted();
      const response = await fetchImpl(`${url}?hours=${hours}`, { signal });
      if (!response.ok) throw new Error(`World events HTTP ${response.status}`);
      const payload = await response.json();
      signal?.throwIfAborted();
      const rows = normalizeWorldEventsSnapshot(payload);
      if (!rows) throw new Error('Malformed world events response');
      return rows;
    },
  };
}
