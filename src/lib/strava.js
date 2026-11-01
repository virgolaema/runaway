// Strava sync for the web/iPhone version (Garmin → Strava → Runaway).
// Token exchange goes through the user's Cloudflare Worker (strava-worker/), which holds the client secret.

const RUN_TYPES = new Set(['Run', 'TrailRun', 'VirtualRun']);
export const OAUTH_STATE = 'runaway-strava';

const base = (proxy) => proxy.replace(/\/+$/, '');

async function call(proxy, path, opts = {}) {
  const res = await fetch(`${base(proxy)}${path}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || `Errore ${res.status}`);
  return data;
}

export function redirectUri() {
  return `${location.origin}${location.pathname}`;
}

// Sends the browser to Strava's consent page.
export async function startAuth(proxy) {
  const { client_id } = await call(proxy, '/config');
  const q = new URLSearchParams({
    client_id,
    response_type: 'code',
    redirect_uri: redirectUri(),
    approval_prompt: 'auto',
    scope: 'activity:read_all',
    // The proxy travels in `state`: the callback may land in a context with different storage.
    state: `${OAUTH_STATE}.${btoa(base(proxy))}`,
  });
  location.href = `https://www.strava.com/oauth/authorize?${q}`;
}

// Strava callback: ?code=...&scope=...&state=runaway-strava.<base64 proxy>
export function callbackCode() {
  const p = new URLSearchParams(location.search);
  const [tag, enc] = (p.get('state') || '').split('.');
  if (tag !== OAUTH_STATE) return null;
  let proxy = null;
  try { proxy = atob(enc || ''); } catch { /* malformed */ }
  if (p.get('error')) return { error: p.get('error'), proxy };
  if (!p.get('scope')?.includes('activity:read')) return { error: 'Serve il permesso di lettura delle attività', proxy };
  return { code: p.get('code'), proxy };
}

export async function exchange(proxy, code) {
  const t = await call(proxy, '/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
  return { proxy, ...t, athlete: t.athlete ? `${t.athlete.firstname} ${t.athlete.lastname}`.trim() : '' };
}

async function accessToken(conn) {
  if (conn.access_token && conn.expires_at - 120 > Date.now() / 1000) return conn.access_token;
  const t = await call(conn.proxy, '/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: conn.refresh_token }),
  });
  Object.assign(conn, { access_token: t.access_token, refresh_token: t.refresh_token, expires_at: t.expires_at });
  return conn.access_token;
}

// Runs since `from` (Date), in the same shape as Health Connect workouts.
// Mutates conn when tokens are refreshed: the caller must save it.
export async function readRuns(conn, from) {
  const token = await accessToken(conn);
  const out = [];
  for (let page = 1; page <= 5; page++) {
    const q = new URLSearchParams({ after: String(Math.floor(from.getTime() / 1000)), per_page: '100', page: String(page) });
    const list = await call(conn.proxy, `/activities?${q}`, { headers: { Authorization: `Bearer ${token}` } });
    for (const a of list) {
      if (!RUN_TYPES.has(a.sport_type || a.type)) continue;
      out.push({
        id: `strava-${a.id}`,
        start: a.start_date,
        durationSec: a.moving_time,
        meters: a.distance,
        avgHr: a.average_heartrate || null,
        source: a.device_name || 'Strava',
      });
    }
    if (list.length < 100) break;
  }
  return out;
}

// The connection, as a code the user can paste in another context (Safari → home screen app).
export const toCode = (conn) => btoa(JSON.stringify({ p: conn.proxy, r: conn.refresh_token, a: conn.athlete }));
export function fromCode(code) {
  const o = JSON.parse(atob(code.trim()));
  if (!o.p || !o.r) throw new Error('Codice non valido');
  return { proxy: o.p, refresh_token: o.r, athlete: o.a || '', access_token: null, expires_at: 0 };
}
