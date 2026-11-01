import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from '../strava-worker/worker.js';
import * as strava from '../src/lib/strava.js';

const env = { STRAVA_CLIENT_ID: '123', STRAVA_CLIENT_SECRET: 'shh' };
const ORIGIN = 'https://virgolaema.github.io';
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });

describe('strava worker', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('exchanges the code using the secret and returns only the tokens', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ access_token: 'a', refresh_token: 'r', expires_at: 9, athlete: { firstname: 'E', lastname: 'V', email: 'x' } }));
    const res = await worker.fetch(new Request('https://w.dev/token', { method: 'POST', headers: { Origin: ORIGIN }, body: JSON.stringify({ code: 'c1' }) }), env);
    const body = new URLSearchParams(await f.mock.calls[0][1].body.toString());
    expect(body.get('client_secret')).toBe('shh');
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(await res.json()).toEqual({ access_token: 'a', refresh_token: 'r', expires_at: 9, athlete: { firstname: 'E', lastname: 'V' } });
  });

  it('forwards the activity request with the bearer token', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json([]));
    await worker.fetch(new Request('https://w.dev/activities?after=1', { headers: { Authorization: 'Bearer a' } }), env);
    expect(f.mock.calls[0][0]).toBe('https://www.strava.com/api/v3/athlete/activities?after=1');
    expect(f.mock.calls[0][1].headers.Authorization).toBe('Bearer a');
  });

  it('answers CORS preflight and never exposes the secret', async () => {
    const res = await worker.fetch(new Request('https://w.dev/config', { headers: { Origin: ORIGIN } }), env);
    expect(await res.json()).toEqual({ client_id: '123' });
    const pre = await worker.fetch(new Request('https://w.dev/token', { method: 'OPTIONS', headers: { Origin: ORIGIN } }), env);
    expect(pre.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });
});

describe('strava client', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('refreshes an expired token and keeps only runs', async () => {
    const f = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ access_token: 'new', refresh_token: 'r2', expires_at: Date.now() / 1000 + 3600 }))
      .mockResolvedValueOnce(json([
        { id: 1, sport_type: 'Run', start_date: '2026-11-03T06:00:00Z', moving_time: 1800, distance: 5200, average_heartrate: 140, device_name: 'Garmin Forerunner 265' },
        { id: 2, sport_type: 'Ride', start_date: '2026-11-04T06:00:00Z', moving_time: 3600, distance: 30000 },
        { id: 3, sport_type: 'TrailRun', start_date: '2026-11-05T06:00:00Z', moving_time: 2400, distance: 6000 },
      ]));
    const conn = { proxy: 'https://w.dev/', refresh_token: 'r1', access_token: null, expires_at: 0 };
    const runs = await strava.readRuns(conn, new Date('2026-11-01'));
    expect(conn).toMatchObject({ access_token: 'new', refresh_token: 'r2' });
    expect(f.mock.calls[1][0]).toMatch(/^https:\/\/w\.dev\/activities\?after=/);
    expect(runs.map((r) => r.id)).toEqual(['strava-1', 'strava-3']);
    expect(runs[0]).toMatchObject({ meters: 5200, durationSec: 1800, avgHr: 140, source: 'Garmin Forerunner 265' });
  });

  it('round-trips the link code', () => {
    const c = strava.fromCode(strava.toCode({ proxy: 'https://w.dev', refresh_token: 'r', athlete: 'E V' }));
    expect(c).toMatchObject({ proxy: 'https://w.dev', refresh_token: 'r', athlete: 'E V' });
  });
});
