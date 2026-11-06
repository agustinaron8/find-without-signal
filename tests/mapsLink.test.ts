import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../api/resolve-maps';
import { parseCoords } from '../src/lib/geo';
import { findShortLink, resolveCoords } from '../src/lib/mapsLink';

const redirect = (location: string) => new Response(null, { status: 302, headers: { location } });
const page = (html = '') => new Response(html, { status: 200 });
const call = (url: string) => GET(new Request(`https://app.test/api/resolve-maps?url=${encodeURIComponent(url)}`));

function stubFetch(...responses: Response[]) {
  const fetch = vi.fn(async () => responses.shift() ?? page());
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

afterEach(() => vi.unstubAllGlobals());

describe('resolve-maps function', () => {
  it('refuses anything but Google short links, so it is not an open proxy', async () => {
    const fetch = stubFetch();
    expect((await call('https://evil.example/x')).status).toBe(400);
    expect((await call('https://goo.gl/abc')).status).toBe(400);
    expect((await call('https://maps.app.goo.gl.evil.example/abc')).status).toBe(400);
    expect((await call('not a url')).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('follows the redirect and reads the place pin from the final URL', async () => {
    stubFetch(redirect('https://www.google.com/maps/place/X/@-30,-60,15z/data=!3m1!4b1!8m2!3d-31.4201!4d-64.1888'), page());
    const response = await call('https://maps.app.goo.gl/abc123');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ lat: -31.4201, lng: -64.1888 });
  });

  it('reads a dropped pin shared as a query', async () => {
    stubFetch(redirect('https://maps.google.com/?q=-31.4201,-64.1888'), page());
    expect(await (await call('https://goo.gl/maps/abc123')).json()).toMatchObject({ lat: -31.4201, lng: -64.1888 });
  });

  it('stops at a redirect that leaves Google', async () => {
    const fetch = stubFetch(redirect('https://evil.example/@-31.42,-64.18'));
    expect((await call('https://maps.app.goo.gl/abc123')).status).toBe(502);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('gives up after five redirects', async () => {
    stubFetch(...Array.from({ length: 7 }, () => redirect('https://maps.app.goo.gl/loop')));
    expect((await call('https://maps.app.goo.gl/abc123')).status).toBe(502);
  });

  it('finds the pin in the page when the URL has none', async () => {
    stubFetch(redirect('https://www.google.com/maps/place/Lugar/data=!4m2!3m1!1s0x1:0x2'), page('x [null,null,-31.4201,-64.1888] y'));
    expect(await (await call('https://maps.app.goo.gl/abc123')).json()).toMatchObject({ lat: -31.4201, lng: -64.1888 });
  });

  it('does not take the center Google picks from the server address', async () => {
    const html = 'center=-31.1757507%2C-64.3157256 APP_INITIALIZATION_STATE=[[[54617.9,-64.3157256,-31.1757507]';
    stubFetch(redirect('https://www.google.com/maps/place/Lugar/data=!4m2!3m1!1s0x1:0x2'), page(html));
    const response = await call('https://maps.app.goo.gl/abc123');
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: 'no-coords' });
  });

  it('refuses directions, which have more than one place', async () => {
    stubFetch(redirect('https://www.google.com/maps/dir/A/B/@41.91,12.48,14z'), page());
    expect(await (await call('https://maps.app.goo.gl/abc123')).json()).toMatchObject({ error: 'directions' });
  });

  it('reports a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('down'))));
    expect((await call('https://maps.app.goo.gl/abc123')).status).toBe(502);
  });
});

describe('resolveCoords', () => {
  it('finds a short link inside a shared message', () => {
    expect(findShortLink('Nos vemos acá https://maps.app.goo.gl/v96keZTcAbC12 dale')).toBe('https://maps.app.goo.gl/v96keZTcAbC12');
    expect(findShortLink('https://goo.gl/maps/abc123')).toBe('https://goo.gl/maps/abc123');
    expect(findShortLink('-31.42,-64.18')).toBeNull();
  });

  it('reads plain coordinates without the network', async () => {
    const fetch = stubFetch();
    expect(await resolveCoords('-31.4201,-64.1888')).toEqual({ lat: -31.4201, lng: -64.1888 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('says a short link needs internet when offline', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    expect(await resolveCoords('https://maps.app.goo.gl/abc123')).toBe('offline');
  });

  it('uses the function when online', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    stubFetch(new Response(JSON.stringify({ lat: -31.4201, lng: -64.1888 })));
    expect(await resolveCoords('https://maps.app.goo.gl/abc123')).toEqual({ lat: -31.4201, lng: -64.1888 });
  });

  it('passes on why a link has no place', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    stubFetch(new Response(JSON.stringify({ error: 'no-coords' }), { status: 422 }));
    expect(await resolveCoords('https://maps.app.goo.gl/abc123')).toBe('no-coords');
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('down'))));
    expect(await resolveCoords('https://maps.app.goo.gl/abc123')).toBe('failed');
  });
});

describe('long Maps URL formats', () => {
  const expected = { lat: -31.4201, lng: -64.1888 };
  it.each([
    ['viewport', 'https://www.google.com/maps/@-31.4201,-64.1888,17z'],
    ['place pin', 'https://www.google.com/maps/place/X/data=!4m5!3m4!8m2!3d-31.4201!4d-64.1888'],
    ['q', 'https://maps.google.com/?q=-31.4201,-64.1888'],
    ['ll', 'https://maps.google.com/maps?ll=-31.4201,-64.1888&z=16'],
    ['search path', 'https://www.google.com/maps/search/-31.4201,+-64.1888?entry=tts'],
  ])('reads %s', (_name, url) => {
    expect(parseCoords(url)).toEqual(expected);
  });
});
