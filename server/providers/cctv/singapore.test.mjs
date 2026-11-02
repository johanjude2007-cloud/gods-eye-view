import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeSingaporeImageUrl,
  singaporeCameraToSource,
} from './sources.js';
import { sniffRasterImageType } from './media.js';

const CAM = {
  camera_id: '2701',
  location: { latitude: 1.447023728, longitude: 103.7716543 },
  image:
    'https://images.data.gov.sg/api/traffic-images/2026/11/faa578e1-bf36-44f5-b0e0-6f1f4c3b68ef.jpg',
  timestamp: '2026-11-02T20:20:42+08:00',
  image_metadata: { height: 1080, width: 1920, md5: 'abc' },
};

test('a valid Singapore camera maps to a pinned, named source', () => {
  const src = singaporeCameraToSource(CAM);
  assert.equal(src.id, 'sg-2701');
  assert.equal(src.name, 'Woodlands Causeway (towards Johor)');
  assert.equal(src.city, 'Singapore');
  assert.equal(src.cityId, 'sg');
  assert.equal(src.feedType, 'image');
  assert.equal(src.sourceKind, 'sg-datagovsg-open-data');
  assert.equal(src.url, CAM.image);
  assert.equal(src.snapshotUrl, CAM.image);
  assert.ok(src.lat > 1.4 && src.lat < 1.46);
  assert.match(src.license, /data\.gov\.sg/);
});

test('an unknown camera id still maps with a generic name', () => {
  const src = singaporeCameraToSource({ ...CAM, camera_id: '9999' });
  assert.equal(src.id, 'sg-9999');
  assert.equal(src.name, 'Singapore Camera 9999');
});

test('bad records are rejected', () => {
  assert.equal(singaporeCameraToSource(null), null);
  assert.equal(singaporeCameraToSource({ ...CAM, camera_id: 'abc' }), null);
  // Coordinates outside Singapore (this is Hong Kong).
  assert.equal(
    singaporeCameraToSource({
      ...CAM,
      location: { latitude: 22.3, longitude: 114.1 },
    }),
    null,
  );
  // Image not on the pinned host.
  assert.equal(
    singaporeCameraToSource({ ...CAM, image: 'https://evil.example/x.jpg' }),
    null,
  );
});

test('image URLs are pinned to the data.gov.sg image host', () => {
  assert.equal(
    normalizeSingaporeImageUrl(
      'http://images.data.gov.sg/api/traffic-images/2026/11/a.jpg',
    ),
    'https://images.data.gov.sg/api/traffic-images/2026/11/a.jpg',
    'http is upgraded to https',
  );
  assert.equal(
    normalizeSingaporeImageUrl('https://images.data.gov.sg/other/a.jpg'),
    null,
    'off-prefix path is rejected',
  );
  assert.equal(
    normalizeSingaporeImageUrl('https://images.data.gov.sg.evil/x.jpg'),
    null,
    'look-alike host is rejected',
  );
  assert.equal(normalizeSingaporeImageUrl(''), null);
});

test('image bytes are sniffed when the feed mislabels the type', () => {
  assert.equal(
    sniffRasterImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0])),
    'image/jpeg',
  );
  assert.equal(
    sniffRasterImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47])),
    'image/png',
  );
  assert.equal(
    sniffRasterImageType(Buffer.from('RIFF\u0000\u0000\u0000\u0000WEBP', 'binary')),
    'image/webp',
  );
  // Not an image (an HTML error page served as octet-stream).
  assert.equal(sniffRasterImageType(Buffer.from('<html>', 'utf8')), null);
  assert.equal(sniffRasterImageType(Buffer.from([])), null);
});
