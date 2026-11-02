import { inflateRawSync } from 'node:zlib';
import {
  CAMEO_ROOT_LABELS,
  worldEventKind,
} from '../../../src/layers/worldEvents/records.js';

const MAX_ENTRY_BYTES = 64 * 1024 * 1024;

/**
 * Read the first file of a ZIP archive (GDELT exports hold exactly one CSV).
 * Uses the central directory, so entries written with a data descriptor
 * (sizes zeroed in the local header) are read correctly.
 * @param {Buffer} buffer
 * @returns {Buffer}
 */
export function readFirstZipEntry(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22)
    throw new Error('GDELT archive is too small');
  // End of central directory record: scan back over a possible comment.
  let eocd = -1;
  for (
    let i = buffer.length - 22;
    i >= Math.max(0, buffer.length - 65557);
    i--
  ) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('GDELT archive has no central directory');
  const cdOffset = buffer.readUInt32LE(eocd + 16);
  if (buffer.readUInt32LE(cdOffset) !== 0x02014b50)
    throw new Error('GDELT archive central directory is malformed');
  const method = buffer.readUInt16LE(cdOffset + 10);
  const compressedSize = buffer.readUInt32LE(cdOffset + 20);
  const size = buffer.readUInt32LE(cdOffset + 24);
  const localOffset = buffer.readUInt32LE(cdOffset + 42);
  if (size > MAX_ENTRY_BYTES)
    throw new Error('GDELT archive entry is too large');
  if (buffer.readUInt32LE(localOffset) !== 0x04034b50)
    throw new Error('GDELT archive local header is malformed');
  const nameLength = buffer.readUInt16LE(localOffset + 26);
  const extraLength = buffer.readUInt16LE(localOffset + 28);
  const start = localOffset + 30 + nameLength + extraLength;
  const data = buffer.subarray(start, start + compressedSize);
  if (method === 0) return Buffer.from(data);
  if (method === 8)
    return inflateRawSync(data, { maxOutputLength: MAX_ENTRY_BYTES });
  throw new Error(`GDELT archive uses unsupported compression ${method}`);
}

/** Parse a GDELT 2.0 timestamp (YYYYMMDDHHMMSS, UTC) to epoch ms. */
export function parseGdeltStamp(stamp) {
  const s = String(stamp ?? '');
  if (!/^\d{14}$/.test(s)) return null;
  return Date.UTC(
    Number(s.slice(0, 4)),
    Number(s.slice(4, 6)) - 1,
    Number(s.slice(6, 8)),
    Number(s.slice(8, 10)),
    Number(s.slice(10, 12)),
    Number(s.slice(12, 14)),
  );
}

/** The batch stamp 15 minutes × `steps` before `stampMs`. */
export function gdeltStampBefore(stampMs, steps) {
  const d = new Date(stampMs - steps * 15 * 60 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}00`;
}

/**
 * Parse one GDELT 2.0 events export (tab-separated, 61 columns) into map rows.
 * Keeps one row per article + place so a single story does not stack dozens
 * of markers, and records per-country counts for spike detection.
 * Column numbers follow the GDELT 2.0 event codebook.
 * @param {string} csv
 * @returns {{ rows: Array<object>, byCountry: Record<string, {name: string,
 *   conflict: number, protest: number, total: number}> }}
 */
export function parseGdeltEvents(csv) {
  const rows = [];
  const byCountry = {};
  const seen = new Set();
  for (const line of String(csv).split('\n')) {
    const c = line.split('\t');
    if (c.length < 61) continue;
    const lat = Number.parseFloat(c[56]);
    const lon = Number.parseFloat(c[57]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    const root = String(c[28]).padStart(2, '0');
    const kind = worldEventKind(root);
    const place = c[52] || null;
    const country = c[53];
    if (country) {
      const bucket = (byCountry[country] ||= {
        name: place?.split(', ').pop() || country,
        conflict: 0,
        protest: 0,
        total: 0,
      });
      bucket.total++;
      if (kind === 'conflict') bucket.conflict++;
      if (kind === 'protest') bucket.protest++;
    }
    const url = c[60].trim();
    const key = `${url}|${place}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const actors = [c[6], c[16]].filter(Boolean).join(' / ');
    rows.push({
      id: c[0],
      root,
      kind,
      label: CAMEO_ROOT_LABELS[root] || 'Event',
      lat,
      lon,
      timeMs: parseGdeltStamp(c[59]),
      mentions: Number.parseInt(c[31], 10) || 0,
      tone: Math.round(Number.parseFloat(c[34]) * 10) / 10 || 0,
      place,
      country,
      actors: actors || null,
      url,
    });
  }
  return { rows, byCountry };
}
