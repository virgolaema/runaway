// Runaway – Strava bridge (Cloudflare Worker).
// Keeps the Strava client secret off the phone: exchanges/refreshes OAuth tokens
// and forwards the activity list request with CORS headers for the web app.
//
// Variables to set in the Worker (Settings → Variables and Secrets):
//   STRAVA_CLIENT_ID      (text)
//   STRAVA_CLIENT_SECRET  (secret)
//   ALLOWED_ORIGINS       (optional, default https://virgolaema.github.io)

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = req.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || 'https://virgolaema.github.io').split(',').map((s) => s.trim());
    const cors = {
      'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0],
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      Vary: 'Origin',
    };
    const json = (body, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (!env.STRAVA_CLIENT_ID || !env.STRAVA_CLIENT_SECRET) return json({ error: 'STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET non configurati' }, 500);

    if (url.pathname === '/config') return json({ client_id: env.STRAVA_CLIENT_ID });

    if (url.pathname === '/token' && req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      const form = new URLSearchParams({ client_id: env.STRAVA_CLIENT_ID, client_secret: env.STRAVA_CLIENT_SECRET });
      if (body.code) {
        form.set('grant_type', 'authorization_code');
        form.set('code', body.code);
      } else if (body.refresh_token) {
        form.set('grant_type', 'refresh_token');
        form.set('refresh_token', body.refresh_token);
      } else return json({ error: 'code o refresh_token mancante' }, 400);
      const res = await fetch('https://www.strava.com/oauth/token', { method: 'POST', body: form });
      const data = await res.json();
      // Only what the app needs.
      return json(res.ok ? {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: data.expires_at,
        athlete: data.athlete ? { firstname: data.athlete.firstname, lastname: data.athlete.lastname } : undefined,
      } : { error: data.message || 'errore Strava', details: data.errors }, res.status);
    }

    if (url.pathname === '/activities' && req.method === 'GET') {
      const res = await fetch(`https://www.strava.com/api/v3/athlete/activities${url.search}`, {
        headers: { Authorization: req.headers.get('Authorization') || '' },
      });
      return new Response(res.body, { status: res.status, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    return json({ error: 'not found' }, 404);
  },
};
