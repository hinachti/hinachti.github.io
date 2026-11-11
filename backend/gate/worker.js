// The contact form's gate. The site posts here; this Worker passes a message on to the Apps Script (Code.gs) only
// when it comes from the site and its sender is under the limits. The Apps Script's own address is a secret that
// only this Worker holds (SCRIPT_URL), so nobody can go around the limits by posting to Google directly.
//
// Limits per sender (by a daily-salted hash of the address, nothing else is kept): BURST in BURST_MINUTES, and DAILY a
// day. A flood from one address stops here, long before the Apps Script's daily ceiling, so real people still get through.

const SITE = 'https://hinachti.github.io';
const BURST = 3, BURST_MINUTES = 10, DAILY = 6;
const MAX_BODY = 8000;

const reply = (o, status, origin) => new Response(JSON.stringify(o), {
  status,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
  },
});

async function hash(text) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Counts one more for this key, kept for `ttl` seconds. False once `limit` is reached. */
async function bump(env, key, limit, ttl) {
  const n = Number(await env.LIMITS.get(key)) || 0;
  if (n >= limit) return false;
  await env.LIMITS.put(key, String(n + 1), { expirationTtl: Math.max(60, ttl) });
  return true;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = origin === SITE || (!!env.DEV_ORIGIN && origin === env.DEV_ORIGIN);
    const cors = allowed ? origin : '';

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: allowed ? 204 : 403,
        headers: allowed ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST',
          'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400', Vary: 'Origin' } : {},
      });
    }
    if (request.method === 'GET') return reply({ ok: true, service: 'hinachti-contact' }, 200, cors);
    if (request.method !== 'POST') return reply({ ok: false, error: 'method' }, 405, cors);
    if (!allowed) return reply({ ok: false, error: 'origin' }, 403, cors);
    if (!env.SCRIPT_URL) return reply({ ok: false, error: 'server' }, 500, cors);

    const body = await request.text();
    if (!body || body.length > MAX_BODY) return reply({ ok: false, error: 'long' }, 413, cors);

    const day = new Date().toISOString().slice(0, 10);
    const who = await hash(`${day}:${request.headers.get('CF-Connecting-IP') || 'none'}`);
    const slot = Math.floor(Date.now() / 60000 / BURST_MINUTES);
    if (!(await bump(env, `d:${day}:${who}`, DAILY, 86400)) ||
        !(await bump(env, `b:${slot}:${who}`, BURST, BURST_MINUTES * 60))) {
      return reply({ ok: false, error: 'busy' }, 429, cors);
    }

    try {
      const answer = await fetch(env.SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body,
        redirect: 'follow',
      });
      const text = await answer.text();
      JSON.parse(text);   // the Apps Script answers JSON; anything else is a failure, not a message to pass on
      return new Response(text, { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store',
        ...(cors ? { 'Access-Control-Allow-Origin': cors, Vary: 'Origin' } : {}) } });
    } catch {
      return reply({ ok: false, error: 'server' }, 502, cors);
    }
  },
};
