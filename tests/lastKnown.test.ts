import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../api/loc';
import type { MemberLocation } from '../src/db';
import {
  decryptLocation,
  deriveLocationKeys,
  encryptLocation,
  exchangeLocations,
  formatAge,
  memberTag,
  newestLocations,
  nextSyncDelay,
  SYNC_INTERVAL_MS,
} from '../src/lib/lastKnown';

const GROUP = '3f0c9a52-7d1e-4b8a-9c11-2a6f0e4d7b90';
const fix = { memberId: 'm1', lat: -31.45678, lng: -64.26123, acc: 12, t: 1_800_000_000_000 };
const NOW = fix.t + 1000;

describe('location crypto', () => {
  it('round trips between two phones holding the same group id', async () => {
    const a = await deriveLocationKeys(GROUP);
    const b = await deriveLocationKeys(GROUP);
    expect(a.channel).toBe(b.channel);
    expect(await decryptLocation(b.key, await encryptLocation(a.key, fix), NOW)).toEqual(fix);
  });

  it('never exposes the group id or coordinates to the server', async () => {
    const { channel, key } = await deriveLocationKeys(GROUP);
    const data = await encryptLocation(key, fix);
    const tag = await memberTag(channel, 'm1');
    const seen = JSON.stringify({ c: channel, m: tag, d: data });
    for (const secret of [GROUP, 'm1"', '-31.45', '64.26']) expect(seen).not.toContain(secret);
    expect(channel).toMatch(/^[\w-]{22}$/);
    expect(tag).toMatch(/^[\w-]{22}$/);
  });

  it('uses a fresh iv, so the same location does not repeat on the wire', async () => {
    const { key } = await deriveLocationKeys(GROUP);
    expect(await encryptLocation(key, fix)).not.toBe(await encryptLocation(key, fix));
  });

  it('rejects another group, tampering, garbage and far-future times', async () => {
    const { key } = await deriveLocationKeys(GROUP);
    const other = await deriveLocationKeys('another-group');
    const data = await encryptLocation(key, fix);
    expect(await decryptLocation(other.key, data, NOW)).toBeNull();
    const flipped = (data[20] === 'A' ? 'B' : 'A');
    expect(await decryptLocation(key, data.slice(0, 20) + flipped + data.slice(21), NOW)).toBeNull();
    expect(await decryptLocation(key, 'not base64 !!', NOW)).toBeNull();
    expect(await decryptLocation(key, '', NOW)).toBeNull();
    expect(await decryptLocation(key, await encryptLocation(key, { ...fix, lat: 200 }), NOW)).toBeNull();
    expect(await decryptLocation(key, await encryptLocation(key, { ...fix, t: NOW + 2 * 3600 * 1000 }), NOW)).toBeNull();
  });
});

describe('newestLocations', () => {
  const stored: MemberLocation = { groupId: 'g', memberId: 'm1', lat: 1, lng: 1, acc: 5, t: 100 };
  const allowed = new Set(['m1', 'm2']);

  it('never moves a location backwards in time', () => {
    expect(newestLocations('g', [{ ...fix, t: 50 }, { ...fix, t: 100 }], [stored], allowed)).toEqual([]);
    expect(newestLocations('g', [{ ...fix, t: 150 }], [stored], allowed)[0].t).toBe(150);
  });

  it('keeps only the newest of duplicates, and ignores unknown members and myself', () => {
    const fixes = [{ ...fix, memberId: 'm2', t: 10 }, { ...fix, memberId: 'm2', t: 30 }, { ...fix, memberId: 'm2', t: 20 }, { ...fix, memberId: 'stranger', t: 40 }];
    const result = newestLocations('g', fixes, [], allowed);
    expect(result.map((r) => [r.memberId, r.t])).toEqual([['m2', 30]]);
  });
});

describe('nextSyncDelay', () => {
  it('waits the full interval after success and retries within a minute after failures', () => {
    expect(nextSyncDelay(0)).toBe(SYNC_INTERVAL_MS);
    expect(nextSyncDelay(1, 0.5)).toBe(30000);
    expect(nextSyncDelay(2, 0.5)).toBe(60000);
    expect(nextSyncDelay(20, 0.5)).toBe(60000);
  });
});

describe('formatAge', () => {
  it('reads naturally and tolerates clock skew', () => {
    expect(formatAge(-5000)).toBe('recién');
    expect(formatAge(30000)).toBe('recién');
    expect(formatAge(12 * 60000)).toBe('hace 12 min');
    expect(formatAge(60 * 60000)).toBe('hace 1 h');
    expect(formatAge(95 * 60000)).toBe('hace 1 h 35 min');
    expect(formatAge(7.5 * 3600000)).toBe('hace 7 h');
  });
});

describe('exchangeLocations', () => {
  it('sends the write and returns only string entries, capped', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ e: { a: 'x', b: 7, c: 'y' } }))) as unknown as typeof fetch;
    expect(await exchangeLocations('chan', { m: 'tag', d: 'data' }, fetcher)).toEqual(['x', 'y']);
    const [, init] = (fetcher as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ c: 'chan', m: 'tag', d: 'data' });
  });

  it('fails on server errors and on non JSON answers', async () => {
    await expect(exchangeLocations('c', undefined, (async () => new Response('', { status: 503 })) as typeof fetch)).rejects.toThrow();
    await expect(exchangeLocations('c', undefined, (async () => new Response('<html>')) as typeof fetch)).rejects.toThrow();
  });
});

describe('api/loc', () => {
  const C = 'a'.repeat(22);
  const M = 'b'.repeat(22);
  const D = 'c'.repeat(60);
  const call = (body: unknown) => POST(new Request('http://x/api/loc', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }));

  // In-memory stand-in for the Upstash REST pipeline.
  function fakeRedis() {
    const store = new Map<string, Map<string, string>>();
    const ttl = new Map<string, number>();
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe('https://redis.test/pipeline');
      expect((init.headers as Record<string, string>).authorization).toBe('Bearer secret');
      const results = (JSON.parse(init.body as string) as string[][]).map(([cmd, key, ...args]) => {
        const hash = store.get(key) ?? new Map<string, string>();
        store.set(key, hash);
        if (cmd === 'HSET') hash.set(args[0], args[1]);
        if (cmd === 'HDEL') hash.delete(args[0]);
        if (cmd === 'EXPIRE') ttl.set(key, Number(args[0]));
        return { result: cmd === 'HGETALL' ? [...hash.entries()].flat() : 1 };
      });
      return new Response(JSON.stringify(results));
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('KV_REST_API_URL', 'https://redis.test');
    vi.stubEnv('KV_REST_API_TOKEN', 'secret');
    return { store, ttl, fetchMock };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('answers 503 instead of crashing when the database is not connected', async () => {
    vi.stubEnv('KV_REST_API_URL', '');
    vi.stubEnv('KV_REST_API_TOKEN', '');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    expect((await call({ c: C })).status).toBe(503);
  });

  it('stores, expires, returns and deletes a location', async () => {
    const { ttl } = fakeRedis();
    expect(await (await call({ c: C, m: M, d: D })).json()).toEqual({ e: { [M]: D } });
    expect(ttl.get(`loc:${C}`)).toBe(72 * 3600);
    expect(await (await call({ c: C })).json()).toEqual({ e: { [M]: D } });
    expect(await (await call({ c: C, m: M, d: null })).json()).toEqual({ e: {} });
  });

  it('keeps channels apart and is not cacheable', async () => {
    fakeRedis();
    await call({ c: C, m: M, d: D });
    const other = await call({ c: 'z'.repeat(22) });
    expect(await other.json()).toEqual({ e: {} });
    expect(other.headers.get('cache-control')).toBe('no-store');
  });

  it('rejects malformed input before touching the database', async () => {
    const { fetchMock } = fakeRedis();
    const bad = ['nope', {}, { c: 'short' }, { c: C, m: 'x', d: D }, { c: C, m: M }, { c: C, m: M, d: 'x' }, { c: C, m: M, d: '<script>'.repeat(5) }, { c: { a: 1 } }];
    for (const body of bad) expect((await call(body)).status, JSON.stringify(body)).toBe(400);
    expect((await call({ c: C, m: M, d: 'c'.repeat(2000) })).status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports a failure when the database is down', async () => {
    fakeRedis();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down'); }));
    expect((await call({ c: C })).status).toBe(502);
  });
});
