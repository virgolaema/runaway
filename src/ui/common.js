import { toISO } from '../lib/plan.js';
import { estimateSeconds, TYPE_LABEL } from '../lib/workout.js';
import { km, minutes, esc, dow, dateShort } from '../lib/format.js';

export const today = () => toISO(new Date());

export function allSessions(plan) {
  return plan.weeks.flatMap((w) => w.sessions.map((s) => ({ ...s, week: w })));
}

export function findSession(plan, id) {
  for (const w of plan.weeks) {
    const s = w.sessions.find((x) => x.id === id);
    if (s) return { session: s, week: w };
  }
  return null;
}

export function currentWeek(plan, iso = today()) {
  const ws = plan.weeks;
  if (iso < ws[0].start) return ws[0];
  return [...ws].reverse().find((w) => w.start <= iso) || ws[ws.length - 1];
}

export function status(s, logs, iso = today()) {
  const l = logs[s.id];
  if (l?.done) return 'done';
  if (l?.skipped) return 'skipped';
  if (s.date < iso) return 'missed';
  if (s.date === iso) return 'today';
  return 'upcoming';
}

export const STATUS_LABEL = { done: 'Fatto', skipped: 'Saltato', missed: 'Non registrato', today: 'Oggi', upcoming: '' };

export function typeIcon(type) {
  const paths = {
    easy: '<circle cx="12" cy="12" r="3"/>',
    long: '<path d="M4 12h16M14 6l6 6-6 6"/>',
    quality: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    strength: '<path d="M6 8v8M18 8v8M3 10v4M21 10v4M6 12h12"/>',
    race: '<path d="M5 21V4h11l-2 4 2 4H5"/>',
  };
  return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[type] || paths.easy}</svg>`;
}

export function sessionRow(s, week, logs, { showDate = true } = {}) {
  const st = status(s, logs);
  const l = logs[s.id];
  const est = estimateSeconds(s, week.vdot);
  const meta = s.type === 'strength'
    ? minutes(est)
    : st === 'done' && l?.km ? `${km(l.km)} km${l.timeSec ? ' · ' + minutes(l.timeSec) : ''}` : `${km(s.km)} km · ~${minutes(est)}`;
  return `
    <a class="session t-${s.type} st-${st}" href="#/w/${encodeURIComponent(s.id)}">
      <span class="ico">${typeIcon(s.type)}</span>
      ${showDate ? `<span class="when"><b>${dow(s.day)}</b><small>${dateShort(s.date)}</small></span>` : ''}
      <span class="what"><b>${esc(s.title)}</b><small>${TYPE_LABEL[s.type]} · ${meta}</small></span>
      <span class="state">${st === 'done' ? '✓' : st === 'skipped' ? '–' : st === 'missed' ? '!' : ''}</span>
    </a>`;
}

export function doneKm(week, logs) {
  return week.sessions.reduce((s, x) => s + (logs[x.id]?.done && x.type !== 'strength' ? logs[x.id].km || 0 : 0), 0);
}
