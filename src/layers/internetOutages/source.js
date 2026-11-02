import { normalizeInternetOutagesSnapshot } from './records.js';
/** Request and validate the local IODA snapshot before it replaces displayed outages. */
export function createIodaInternetOutagesSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
  url = '/api/internet-outages',
} = {}) {
  return {
    async getSnapshot({ signal } = {}) {
      signal?.throwIfAborted();
      const response = await fetchImpl(url, { signal });
      if (!response.ok)
        throw new Error(`Internet outages HTTP ${response.status}`);
      const payload = await response.json();
      signal?.throwIfAborted();
      const rows = normalizeInternetOutagesSnapshot(payload);
      if (!rows) throw new Error('Malformed internet outages response');
      return rows;
    },
  };
}
