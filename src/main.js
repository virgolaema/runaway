import './styles.css';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { load, save, reset } from './lib/store.js';
import { readRuns, isAuthorized } from './lib/health.js';
import { matchWorkouts } from './lib/sync.js';
import * as strava from './lib/strava.js';
import { addDays, fromISO, toISO } from './lib/plan.js';
import { onboardingView } from './ui/onboarding.js';
import { todayView } from './ui/today.js';
import { planView } from './ui/planview.js';
import { detailView, logView } from './ui/detail.js';
import { runView, leaveRun } from './ui/run.js';
import { progressView, fitnessView } from './ui/progress.js';
import { profileView, scienceView, stravaLinkView } from './ui/profile.js';

const root = document.getElementById('app');
let state = load();

const VIEWS = {
  onboarding: onboardingView,
  today: todayView,
  plan: planView,
  w: detailView,
  log: logView,
  run: runView,
  progress: progressView,
  fitness: fitnessView,
  profile: profileView,
  science: scienceView,
  strava: stravaLinkView,
};
const TABS = [
  ['today', 'Oggi', '<path d="M12 3v2m0 14v2M3 12h2m14 0h2M6 6l1.4 1.4m9.2 9.2L18 18M6 18l1.4-1.4m9.2-9.2L18 6"/><circle cx="12" cy="12" r="4"/>'],
  ['plan', 'Piano', '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4m8-4v4"/>'],
  ['progress', 'Progressi', '<path d="M4 20V10m6 10V4m6 16v-7m4 7H2"/>'],
  ['profile', 'Profilo', '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>'],
];

function parseRoute() {
  const [name, ...rest] = location.hash.replace(/^#\/?/, '').split('/');
  return { name: name || '', param: rest.join('/') ? decodeURIComponent(rest.join('/')) : null };
}

export function go(name, param) {
  const h = `#/${name}${param ? '/' + encodeURIComponent(param) : ''}`;
  if (location.hash === h) render();
  else location.hash = h;
}

export function replaceRoute(name, param) {
  history.replaceState(null, '', `#/${name}${param ? '/' + encodeURIComponent(param) : ''}`);
  render();
}

const ctx = {
  get state() { return state; },
  go,
  replaceRoute,
  back: () => history.back(),
  update(fn) {
    fn(state);
    save(state);
    render();
  },
  silentUpdate(fn) {
    fn(state);
    save(state);
  },
  reset() {
    state = reset();
    replaceRoute('onboarding');
  },
  render: () => render(),
  syncWatch: () => syncWatch(),
  get stravaPending() { return stravaPending; },
};

// Strava OAuth callback (web/iPhone). If this context has no plan (e.g. Safari instead of the
// home screen app, which has separate storage) the connection is shown as a code to paste.
let stravaPending = null;
async function handleStravaCallback() {
  const cb = strava.callbackCode();
  if (!cb) return;
  history.replaceState(null, '', location.pathname + (state.plan ? '#/profile' : '#/strava'));
  const proxy = cb.proxy;
  try {
    if (cb.error) throw new Error(cb.error);
    if (!proxy) throw new Error('Indirizzo del server Strava mancante');
    const conn = await strava.exchange(proxy, cb.code);
    if (state.plan) {
      state.strava = conn;
      state.history.push({ date: toISO(new Date()), event: 'Strava collegato' });
      save(state);
      await syncWatch();
    } else {
      stravaPending = { code: strava.toCode(conn) };
    }
  } catch (e) {
    stravaPending = { error: e.message };
  }
  render();
}

// Import runs recorded by the watch (Garmin Connect → Health Connect).
let syncing = null;
async function syncWatch() {
  if (state.plan && state.strava?.refresh_token) return syncStrava();
  if (!state.plan || !state.watch?.enabled) return 0;
  if (syncing) return syncing;
  syncing = (async () => {
    try {
      if (!(await isAuthorized())) {
        state.watch.error = 'Permessi Health Connect revocati';
        save(state);
        return 0;
      }
      const t = toISO(new Date());
      const fromIso = [state.plan.start, addDays(t, -29)].sort().pop();
      const runs = await readRuns(fromISO(fromIso), new Date());
      const n = mergeRuns(runs);
      state.watch.lastSync = new Date().toISOString();
      state.watch.error = null;
      save(state);
      if (n) render();
      return n;
    } catch (e) {
      state.watch.error = e.message;
      save(state);
      return 0;
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}

function mergeRuns(runs) {
  const fresh = matchWorkouts(state.plan, state.logs, runs);
  Object.assign(state.logs, fresh);
  return Object.keys(fresh).length;
}

async function syncStrava() {
  if (syncing) return syncing;
  syncing = (async () => {
    const conn = state.strava;
    try {
      const fromIso = [state.plan.start, addDays(toISO(new Date()), -29)].sort().pop();
      const n = mergeRuns(await strava.readRuns(conn, fromISO(fromIso)));
      conn.lastSync = new Date().toISOString();
      conn.error = null;
      save(state);
      if (n) render();
      return n;
    } catch (e) {
      conn.error = e.message;
      save(state);
      return 0;
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}

let current = null;
function render() {
  let { name, param } = parseRoute();
  if (!state.plan && !['onboarding', 'science', 'strava'].includes(name)) name = 'onboarding';
  if (!VIEWS[name]) name = 'today';
  if (current && current.name === 'run' && name !== 'run') leaveRun();
  current = { name, param };
  const view = VIEWS[name];
  const html = view.html(ctx, param);
  const showTabs = TABS.some(([t]) => t === name);
  root.innerHTML = `<main class="screen ${showTabs ? 'with-tabs' : ''}">${html}</main>${showTabs ? tabbar(name) : ''}`;
  view.bind?.(root, ctx, param);
  if (!view.keepScroll) window.scrollTo(0, 0);
}

function tabbar(active) {
  return `<nav class="tabbar">${TABS.map(([id, label, icon]) => `
    <a href="#/${id}" class="${id === active ? 'active' : ''}">
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${icon}</svg>
      <span>${label}</span></a>`).join('')}</nav>`;
}

window.addEventListener('hashchange', render);

if (Capacitor.isNativePlatform()) {
  App.addListener('resume', () => {
    if (parseRoute().name !== 'run') syncWatch();
  });
  App.addListener('backButton', () => {
    const { name } = parseRoute();
    if (['today', 'onboarding', ''].includes(name) || (!state.plan && name === 'onboarding')) App.exitApp();
    else if (TABS.some(([t]) => t === name)) go('today');
    else history.back();
  });
}

if (!location.hash) history.replaceState(null, '', state.plan ? '#/today' : '#/onboarding');
render();
if (strava.callbackCode()) handleStravaCallback();
else syncWatch();
if (!Capacitor.isNativePlatform()) {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && parseRoute().name !== 'run') syncWatch();
  });
}

// Web / iPhone (home screen app): offline cache.
if (!Capacitor.isNativePlatform() && import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
