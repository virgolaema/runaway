import { fromISO } from './plan.js';

export function pace(sec) {
  if (!isFinite(sec) || sec <= 0) return '–';
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function paceRange([a, b]) {
  return `${pace(a)}–${pace(b)} /km`;
}

export function duration(sec, { long = false } = {}) {
  const s = Math.round(sec);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  if (long || h) return `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  return `${m}:${String(ss).padStart(2, '0')}`;
}

export function minutes(sec) {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m}'`;
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
}

export function km(x) {
  if (!x) return '0';
  return (Math.round(x * 10) / 10).toLocaleString('it-IT');
}

export function parseTime(str) {
  if (!str) return null;
  const parts = String(str).trim().split(/[:.,']/).map((x) => Number(x));
  if (parts.some((x) => !isFinite(x))) return null;
  let s = 0;
  for (const p of parts) s = s * 60 + p;
  if (parts.length === 2 && parts[0] < 4) s *= 60; // "1:45" means h:mm
  return s > 0 ? s : null;
}

const DOW = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
export const DOW_LONG = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
const MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

export function dow(i) {
  return DOW[i];
}

export function dateShort(iso) {
  const d = fromISO(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function dateLong(iso) {
  const d = fromISO(iso);
  return `${DOW_LONG[(d.getDay() + 6) % 7]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
