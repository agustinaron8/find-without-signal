import jsQR from 'jsqr';
import { compressToEncodedURIComponent } from 'lz-string';
import QRCode from 'qrcode';
import { describe, expect, it } from 'vitest';
import type { Group } from '../src/db';
import { buildShareUrl, decodeGroup, encodeGroup, extractPayload, MAX_MEMBERS, mergeImportedGroup } from '../src/lib/share';

const group: Group = {
  id: 'g1',
  name: 'Lolla 2026 ñandú',
  createdAt: 1700000000000,
  members: [
    { id: 'm1', name: 'Agustín', color: '#38bdf8', phone: '+5493510000000' },
    { id: 'm2', name: 'Juan', color: '#fbbf24' },
  ],
  meetingPoints: [
    { id: 'p1', name: 'Torre de sonido', lat: -34.45, lng: -58.54, description: 'Cartel azul', isPrimary: true },
  ],
  plan: 'Cada hora en punto en el Punto A',
  planTimes: ['18:00', '19:00'],
  offlineArea: { bbox: [0, 0, 1, 1], minZoom: 10, maxZoom: 14, tileCount: 5, downloadedAt: 1, tilesetVersionUrl: 'x' },
  myMemberId: 'm1',
};

const encodeRaw = (value: unknown) => compressToEncodedURIComponent(JSON.stringify(value));
const valid = JSON.parse(JSON.stringify({ ...group, v: 1 }));

describe('payload', () => {
  it('round-trips without local-only fields', () => {
    const decoded = decodeGroup(encodeGroup(group));
    expect(decoded?.name).toBe(group.name);
    expect(decoded?.meetingPoints[0]).toMatchObject({ lat: -34.45, lng: -58.54, isPrimary: true });
    expect(decoded?.members[0].phone).toBe('+5493510000000');
    expect(decoded?.planTimes).toEqual(['18:00', '19:00']);
    expect(decoded).not.toHaveProperty('offlineArea');
    expect(decoded).not.toHaveProperty('myMemberId');
  });

  it('extracts the payload from a link or raw text', () => {
    const url = buildShareUrl(group, 'https://x.app');
    expect(url.startsWith('https://x.app/i#')).toBe(true);
    expect(decodeGroup(extractPayload(`  ${url} `))?.id).toBe('g1');
    expect(extractPayload('abc')).toBe('abc');
  });

  it.each([
    ['garbage', 'not-a-payload'],
    ['empty', ''],
    ['wrong version', encodeRaw({ ...valid, v: 2 })],
    ['null json', encodeRaw(null)],
    ['no points', encodeRaw({ ...valid, meetingPoints: [] })],
    ['latitude out of range', encodeRaw({ ...valid, meetingPoints: [{ id: 'p', name: 'P', lat: 91, lng: 0 }] })],
    ['string coordinate', encodeRaw({ ...valid, meetingPoints: [{ id: 'p', name: 'P', lat: '1', lng: 0 }] })],
    ['null member', encodeRaw({ ...valid, members: [null] })],
  ])('rejects %s', (_name, payload) => {
    expect(decodeGroup(payload)).toBeNull();
  });

  it('drops unknown fields and replaces unsafe colors', () => {
    const decoded = decodeGroup(
      encodeRaw({
        ...valid,
        offlineArea: { bbox: [9, 9, 9, 9] },
        myMemberId: 'm2',
        evil: true,
        members: [{ id: 'm', name: 'M', color: 'url(https://evil.example/x)' }],
      }),
    );
    expect(decoded).not.toHaveProperty('offlineArea');
    expect(decoded).not.toHaveProperty('myMemberId');
    expect(decoded).not.toHaveProperty('evil');
    expect(decoded?.members[0].color).toBe('#38bdf8');
  });
});

describe('mergeImportedGroup', () => {
  const imported = decodeGroup(encodeGroup(group))!;

  it('keeps the downloaded map and identity on update', () => {
    const merged = mergeImportedGroup(imported, group, 'm2');
    expect(merged.offlineArea).toEqual(group.offlineArea);
    expect(merged.myMemberId).toBe('m2');
  });

  it('ignores an identity that is not in the group', () => {
    expect(mergeImportedGroup(imported, undefined, 'ghost').myMemberId).toBeUndefined();
  });
});

describe('QR', () => {
  it('a share link survives being rendered and scanned', () => {
    const url = buildShareUrl(group, 'https://reencuentro.vercel.app');
    const { modules } = QRCode.create(url, { errorCorrectionLevel: 'L' });
    const scale = 4;
    const margin = 4;
    const size = (modules.size + margin * 2) * scale;
    const pixels = new Uint8ClampedArray(size * size * 4).fill(255);
    for (let y = 0; y < modules.size; y++) {
      for (let x = 0; x < modules.size; x++) {
        if (!modules.get(y, x)) continue;
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            const i = (((y + margin) * scale + dy) * size + (x + margin) * scale + dx) * 4;
            pixels[i] = pixels[i + 1] = pixels[i + 2] = 0;
          }
        }
      }
    }
    expect(jsQR(pixels, size, size)?.data).toBe(url);
  });
});

describe('large groups', () => {
  const members = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `m${i}`, name: `Persona ${i}`, color: '#38bdf8' }));
  const point = { id: 'p', name: 'P', lat: 1, lng: 1 };

  it('keeps everyone up to the limit, across a link', () => {
    const decoded = decodeGroup(encodeGroup({ id: 'g', name: 'Grande', createdAt: 1, members: members(MAX_MEMBERS), meetingPoints: [point] }));
    expect(MAX_MEMBERS).toBe(100);
    expect(decoded?.members).toHaveLength(100);
    expect(decoded?.members[99].name).toBe('Persona 99');
  });
});
