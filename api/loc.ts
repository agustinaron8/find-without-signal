// Mailbox for last known locations. It only ever sees opaque ids and ciphertext:
// the key comes from the group id, which stays in the share link's hash and never reaches a server.
declare const process: { env: Record<string, string | undefined> };

const TTL_SECONDS = 72 * 60 * 60;
const CHANNEL = /^[\w-]{22}$/;
const MEMBER = /^[\w-]{22}$/;
const CIPHERTEXT = /^[\w-]{20,600}$/;
const MAX_BODY_CHARS = 1024;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

function redisCommands(channel: string, member: unknown, data: unknown, writeOnly: boolean): string[][] | null {
  const key = `loc:${channel}`;
  const read = writeOnly ? [] : [['HGETALL', key]];
  if (member === undefined) return writeOnly ? null : read;
  if (typeof member !== 'string' || !MEMBER.test(member)) return null;
  if (data === null) return [['HDEL', key, member], ...read];
  if (typeof data !== 'string' || !CIPHERTEXT.test(data)) return null;
  return [['HSET', key, member, data], ['EXPIRE', key, String(TTL_SECONDS)], ...read];
}

export async function POST(request: Request): Promise<Response> {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return json({ error: 'not-configured' }, 503);

  const text = await request.text();
  if (text.length > MAX_BODY_CHARS) return json({ error: 'too-large' }, 413);

  let body: { c?: unknown; m?: unknown; d?: unknown; w?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return json({ error: 'bad-request' }, 400);
  }
  if (typeof body?.c !== 'string' || !CHANNEL.test(body.c)) return json({ error: 'bad-request' }, 400);
  const commands = redisCommands(body.c, body.m, body.d, body.w === 1);
  if (!commands) return json({ error: 'bad-request' }, 400);

  const upstream = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(commands),
  }).catch(() => null);
  if (!upstream?.ok) return json({ error: 'upstream' }, 502);

  // Each command reports its own error inside a 200, and saying "saved" when it was not would stop the retries.
  const results = (await upstream.json().catch(() => null)) as { result?: unknown; error?: unknown }[] | null;
  if (!Array.isArray(results) || results.some((r) => r?.error)) return json({ error: 'upstream' }, 502);
  const flat = results[results.length - 1]?.result;
  const entries: Record<string, string> = {};
  if (Array.isArray(flat)) {
    for (let i = 0; i + 1 < flat.length; i += 2) entries[String(flat[i])] = String(flat[i + 1]);
  }
  return json({ e: entries });
}
