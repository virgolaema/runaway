// Match runs recorded by a watch (via Health Connect) to planned sessions.
import { toISO, addDays } from './plan.js';

// workouts: [{ id, start (ISO datetime), durationSec, meters, avgHr, source }]
// Returns the new log entries keyed by log id; does not touch already imported runs.
export function matchWorkouts(plan, logs, workouts) {
  const imported = new Set(Object.values(logs).map((l) => l.extId).filter(Boolean));
  const taken = new Set(Object.entries(logs).filter(([, l]) => l.done || l.skipped).map(([id]) => id));
  const sessions = plan.weeks.flatMap((w) => w.sessions).filter((s) => s.type !== 'strength');
  const out = {};

  const runs = workouts
    .filter((w) => w.id && !imported.has(w.id) && w.meters > 500)
    .sort((a, b) => (a.start < b.start ? -1 : 1));

  for (const w of runs) {
    const date = toISO(new Date(w.start));
    const km = Math.round(w.meters / 10) / 100;
    // Same day first, then the day before/after (moved session).
    const candidates = [date, addDays(date, -1), addDays(date, 1)]
      .map((d) => sessions.find((s) => s.date === d && !taken.has(s.id)))
      .filter(Boolean);
    const s = candidates[0];
    const entry = {
      done: true,
      date,
      km,
      timeSec: Math.round(w.durationSec),
      avgHr: w.avgHr ? Math.round(w.avgHr) : null,
      source: w.source || 'orologio',
      extId: w.id,
      needsRpe: true,
    };
    // A run already logged by hand that day is the same run: enrich it with the watch data.
    const manual = sessions.find((x) => x.date === date && logs[x.id]?.done && !logs[x.id].extId && !out[x.id]);
    if (manual) {
      const l = logs[manual.id];
      out[manual.id] = { ...l, km, timeSec: entry.timeSec, avgHr: entry.avgHr, source: entry.source, extId: w.id };
    } else if (s) {
      taken.add(s.id);
      out[s.id] = entry;
    } else {
      out[`extra-${w.id}`] = { ...entry, extra: true };
    }
  }
  return out;
}

export function extraRuns(logs, from, to) {
  return Object.entries(logs)
    .filter(([, l]) => l.extra && l.date >= from && l.date <= to)
    .map(([id, l]) => ({ id, ...l }));
}
