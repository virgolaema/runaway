import './styles.css';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { load, save, reset } from './lib/store.js';
import { onboardingView } from './ui/onboarding.js';
import { todayView } from './ui/today.js';
import { planView } from './ui/planview.js';
import { detailView, logView } from './ui/detail.js';
import { runView, leaveRun } from './ui/run.js';
import { progressView, fitnessView } from './ui/progress.js';
import { profileView, scienceView } from './ui/profile.js';

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
};

let current = null;
function render() {
  let { name, param } = parseRoute();
  if (!state.plan && name !== 'onboarding' && name !== 'science') name = 'onboarding';
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
  App.addListener('backButton', () => {
    const { name } = parseRoute();
    if (['today', 'onboarding', ''].includes(name) || (!state.plan && name === 'onboarding')) App.exitApp();
    else if (TABS.some(([t]) => t === name)) go('today');
    else history.back();
  });
}

if (!location.hash) history.replaceState(null, '', state.plan ? '#/today' : '#/onboarding');
render();
