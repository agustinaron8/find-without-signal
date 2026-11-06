// Expands a Google Maps short link, which only says where it points once opened. Only Google
// hosts are fetched, at the start and at every redirect, so this cannot be used as an open proxy.
const START_HOSTS = /^(maps\.app\.goo\.gl|goo\.gl)$/;
const GOOGLE_HOSTS = /^(maps\.app\.goo\.gl|goo\.gl|(www\.|maps\.)?google\.[a-z]{2,3}(\.[a-z]{2})?)$/;
const MAX_REDIRECTS = 5;
const MAX_URL_CHARS = 300;
const MAX_HTML_CHARS = 2_000_000;
const TIMEOUT_MS = 6000;
// The desktop page carries the place's coordinates; the light one sent to phones does not.
const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
// Skips the cookie consent page that Google shows to servers in some regions.
const CONSENT = 'CONSENT=PENDING+987; SOCS=CAESHAgBEhJnd3NfMjAyMzA4MTAtMF9SQzIaAmRlIAEaBgiAo_CmBg';

const NUM = '(-?\\d{1,3}\\.\\d+)';
// Most specific first: `!3d!4d` is the place's own pin, `@` only the center of the view.
const URL_PATTERNS = [
  new RegExp(`!3d${NUM}!4d${NUM}`),
  new RegExp(`[?&](?:q|ll|query|destination)=(?:loc:)?${NUM}(?:,|%2C)\\s*${NUM}`),
  new RegExp(`/maps/(?:search|place)/${NUM},[\\s+]*${NUM}`),
  new RegExp(`@${NUM},${NUM}`),
];
// The page also has a center from the IP address of whoever asks, so only the place pin counts.
const HTML_PATTERNS = [new RegExp(`%213d${NUM}%214d${NUM}`), new RegExp(`\\[null,null,${NUM},${NUM}\\]`)];

type Coords = { lat: number; lng: number };

const json = (body: unknown, status = 200, cache = 'no-store') =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': cache } });

function firstMatch(text: string, patterns: RegExp[]): Coords | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const lat = Number(match[1]);
    const lng = Number(match[2]);
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
  }
  return null;
}

function parseUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}

async function get(url: URL): Promise<Response> {
  return fetch(url, {
    redirect: 'manual',
    headers: { 'user-agent': USER_AGENT, cookie: CONSENT, 'accept-language': 'es-AR,es;q=0.9' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

export async function GET(request: Request): Promise<Response> {
  const raw = new URL(request.url).searchParams.get('url') ?? '';
  const start = raw.length <= MAX_URL_CHARS ? parseUrl(raw) : null;
  if (!start || !START_HOSTS.test(start.hostname) || (start.hostname === 'goo.gl' && !start.pathname.startsWith('/maps'))) {
    return json({ error: 'bad-url' }, 400);
  }
  let url: URL = start;

  try {
    let response = await get(url);
    for (let hop = 0; response.status >= 300 && response.status < 400; hop++) {
      const location = response.headers.get('location');
      const next: URL | null = location ? parseUrl(new URL(location, url).href) : null;
      if (hop >= MAX_REDIRECTS || !next || !GOOGLE_HOSTS.test(next.hostname)) return json({ error: 'failed' }, 502);
      url = next;
      response = await get(url);
    }

    const finalUrl = decodeURIComponent(url.href);
    // Directions have a start and an end; picking one would be a guess.
    if (url.pathname.includes('/maps/dir/')) return json({ url: url.href, error: 'directions' }, 422);
    const fromUrl = firstMatch(finalUrl, URL_PATTERNS);
    if (fromUrl) return json({ url: url.href, ...fromUrl }, 200, 'public, s-maxage=86400');

    if (!response.ok || !url.pathname.startsWith('/maps/place/')) return json({ url: url.href, error: 'no-coords' }, 422);
    const html = (await response.text()).slice(0, MAX_HTML_CHARS);
    const fromHtml = firstMatch(html, HTML_PATTERNS);
    if (fromHtml) return json({ url: url.href, ...fromHtml }, 200, 'public, s-maxage=86400');
    return json({ url: url.href, error: 'no-coords' }, 422);
  } catch {
    return json({ error: 'failed' }, 502);
  }
}
