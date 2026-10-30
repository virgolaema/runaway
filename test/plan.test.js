import { describe, it, expect } from 'vitest';
import { generatePlan, replan, adaptationSignal, addDays, HM_KM } from '../src/lib/plan.js';
import { vdotFromRace, predictRaceTime, trainingPaces } from '../src/lib/vdot.js';

const base = { today: '2026-11-02', startDate: '2026-11-02', raceDate: '2027-03-07', runDays: [1, 3, 6], longRunDay: 6, age: 35 };
const profiles = {
  principiante: { ...base, level: 'principiante', weeklyKm: 10, longestRunKm: 5, canRun30: true },
  principianteZero: { ...base, level: 'principiante', weeklyKm: 0, longestRunKm: 0, canRun30: false },
  intermedio: { ...base, level: 'intermedio', weeklyKm: 22, longestRunKm: 10, runDays: [1, 3, 4, 6], raceDistanceKm: 10, raceTimeSec: 55 * 60, goalTimeSec: 7200 },
  avanzato: { ...base, level: 'avanzato', weeklyKm: 45, longestRunKm: 16, runDays: [0, 1, 3, 4, 6], raceDistanceKm: 10, raceTimeSec: 42 * 60 },
  corto: { ...base, level: 'intermedio', weeklyKm: 25, longestRunKm: 12, raceDate: '2026-12-13' },
};

const runs = (w) => w.sessions.filter((s) => !['strength', 'race'].includes(s.type));

describe('VDOT', () => {
  it('matches Daniels tables', () => {
    expect(vdotFromRace(5, 20 * 60)).toBeCloseTo(49.8, 0);
    expect(predictRaceTime(50, HM_KM) / 60).toBeCloseTo(91.5, 0);
    const p = trainingPaces(40);
    expect(p.T[0]).toBeGreaterThan(290); // ~5:00/km
    expect(p.T[0]).toBeLessThan(305);
  });
});

describe.each(Object.entries(profiles))('plan %s', (name, profile) => {
  const plan = generatePlan(profile);
  const all = plan.weeks.flatMap((w) => w.sessions);

  it('ends with the race on race day', () => {
    const race = all.filter((s) => s.type === 'race');
    expect(race).toHaveLength(1);
    expect(race[0].date).toBe(profile.raceDate);
    expect(all.every((s) => s.date <= profile.raceDate)).toBe(true);
  });

  it('never has a run >10% longer than the longest run of the previous 30 days', () => {
    const sorted = all.filter((s) => s.type !== 'strength' && s.type !== 'race').sort((a, b) => (a.date < b.date ? -1 : 1));
    for (const s of sorted) {
      const prior = sorted.filter((x) => x.date < s.date && x.date >= addDays(s.date, -30)).map((x) => x.km);
      const ref = Math.max(profile.longestRunKm || 0, ...prior, profile.level === 'principiante' ? 3 : 5);
      // allow the 0.5 km rounding on easy runs and the strides add-on
      expect(s.km, `${name} ${s.date} ${s.title}`).toBeLessThanOrEqual(ref * 1.1 + 0.5);
    }
  });

  it('weekly volume grows gradually', () => {
    for (let i = 1; i < plan.weeks.length; i++) {
      const prev = Math.max(...plan.weeks.slice(Math.max(0, i - 4), i).map((w) => w.plannedKm));
      expect(plan.weeks[i].plannedKm, `${name} week ${i + 1}`).toBeLessThanOrEqual(prev * 1.2 + 1.5);
    }
  });

  it('keeps most of the running easy', () => {
    const km = plan.weeks.flatMap(runs).reduce((s, x) => s + x.km, 0);
    const hard = plan.weeks.flatMap(runs).filter((s) => s.type === 'quality').reduce((s, x) => s + x.km * 0.5, 0); // ~half of a quality session is warm-up/recovery
    expect(hard / km).toBeLessThan(0.2);
  });

  it('never schedules two hard days in a row', () => {
    const hard = all.filter((s) => s.type === 'quality' || s.type === 'long' || s.type === 'race').map((s) => s.date).sort();
    for (let i = 1; i < hard.length; i++) expect(addDays(hard[i - 1], 1), name).not.toBe(hard[i]);
  });

  it('tapers before the race', () => {
    const peak = Math.max(...plan.weeks.map((w) => w.plannedKm));
    const last = plan.weeks[plan.weeks.length - 1];
    expect(last.plannedKm).toBeLessThan(peak * 0.65);
  });

  it('has at least one rest day each week', () => {
    for (const w of plan.weeks) expect(new Set(runs(w).map((s) => s.day)).size).toBeLessThan(7);
  });
});

describe('adaptation', () => {
  const plan = generatePlan(profiles.intermedio);
  it('signals pain and eases the plan', () => {
    const t = '2026-11-12';
    const s = plan.weeks[1].sessions.find((x) => x.type !== 'strength');
    const logs = { [s.id]: { done: true, km: s.km, rpe: 5, pain: true, date: s.date } };
    const sig = adaptationSignal(plan, logs, addDays(s.date, 1));
    expect(sig?.factor).toBeLessThan(1);
    const np = replan(profiles.intermedio, plan, logs, addDays(s.date, 1), sig.factor);
    expect(np.weeks.at(-1).sessions.some((x) => x.type === 'race')).toBe(true);
    expect(np.totalWeeks).toBe(plan.totalWeeks);
    expect(adaptationSignal(np, logs, addDays(s.date, 1))).toBeNull();
    void t;
  });
});

describe('watch sync', async () => {
  const { matchWorkouts } = await import('../src/lib/sync.js');
  const plan = generatePlan(profiles.intermedio);
  const runsList = plan.weeks[0].sessions.filter((s) => s.type !== 'strength');
  const at = (date, h = 7) => new Date(`${date}T0${h}:30:00`).toISOString();

  it('matches a run to the planned session of the same day', () => {
    const s = runsList[0];
    const out = matchWorkouts(plan, {}, [{ id: 'g1', start: at(s.date), durationSec: 1800, meters: 5230, avgHr: 141.6, source: 'Garmin' }]);
    expect(out[s.id]).toMatchObject({ done: true, km: 5.23, timeSec: 1800, avgHr: 142, extId: 'g1', needsRpe: true });
  });

  it('matches a run moved by one day and ignores already imported runs', () => {
    const s = runsList[0]; // Tuesday; Wednesday has no session
    const w = { id: 'g2', start: at(addDays(s.date, 1)), durationSec: 2400, meters: 7000 };
    const out = matchWorkouts(plan, {}, [w]);
    expect(Object.keys(out)).toEqual([s.id]);
    expect(matchWorkouts(plan, out, [w])).toEqual({});
  });

  it('enriches a manual log instead of double counting', () => {
    const s = runsList[0];
    const logs = { [s.id]: { done: true, km: 5, timeSec: 1700, rpe: 4, date: s.date } };
    const out = matchWorkouts(plan, logs, [{ id: 'g3', start: at(s.date, 8), durationSec: 1750, meters: 5100 }]);
    expect(out[s.id]).toMatchObject({ rpe: 4, km: 5.1, extId: 'g3' });
  });

  it('keeps unplanned runs as extra', () => {
    const out = matchWorkouts(plan, {}, [{ id: 'g4', start: at('2026-10-01'), durationSec: 1200, meters: 3000 }]);
    expect(out['extra-g4']).toMatchObject({ extra: true, km: 3 });
  });
});
