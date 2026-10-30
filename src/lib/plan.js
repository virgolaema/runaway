// Half-marathon plan generator.
//
// Evidence used (see src/ui/profile.js REFS for references):
//  - Single-run spikes: no run longer than 110% of the longest run of the previous
//    30 days (Frandsen et al., BJSM 2025, 5,200 runners).
//  - Weekly load grows <=10%/week, with a down week every 3rd-4th week
//    (Nielsen et al. 2014; Damsted et al. 2019).
//  - ~80% of running time at low intensity, pyramidal/polarized distribution
//    (Seiler 2010; Stöggl & Sperlich 2014; Rosenblat et al. 2019; Oliveira et al. 2024).
//  - Quality volume caps: T <= ~10% and I <= ~8% of weekly km (Daniels).
//  - Taper 10-14 days, volume -40-60%, intensity and frequency kept
//    (Bosquet et al. 2007; Wang et al. 2023).
//  - Strength training 2x/week (Lauersen et al. 2014; Blagrove et al. 2018).

import { defaultVdot, predictRaceTime, vdotFromRace } from './vdot.js';

export const HM_KM = 21.0975;
const DAY = 86400000;

const LEVEL = {
  principiante: { peakWeekly: 34, peakLong: 18, minEasy: 3, maxLongFrac: 0.55, maxQuality: 1 },
  intermedio: { peakWeekly: 46, peakLong: 19, minEasy: 4, maxLongFrac: 0.45, maxQuality: 2 },
  avanzato: { peakWeekly: 62, peakLong: 21, minEasy: 5, maxLongFrac: 0.38, maxQuality: 2 },
};

// ---------- date helpers (local dates as YYYY-MM-DD strings) ----------
export function toISO(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
export function fromISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(iso, n) {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}
export function mondayOf(iso) {
  const d = fromISO(iso);
  const dow = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - dow);
  return toISO(d);
}
export function daysBetween(a, b) {
  return Math.round((fromISO(b) - fromISO(a)) / DAY);
}
export function weekdayIndex(iso) {
  return (fromISO(iso).getDay() + 6) % 7;
}

const r05 = (x) => Math.round(x * 2) / 2;
const f05 = (x) => Math.floor(x * 2 + 1e-9) / 2;
const f01 = (x) => Math.floor(x * 10 + 1e-9) / 10;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// ---------- profile → fitness ----------
export function deriveLevel(p) {
  if (p.level) return p.level;
  if (p.weeklyKm >= 35) return 'avanzato';
  if (p.weeklyKm >= 15) return 'intermedio';
  return 'principiante';
}

export function currentVdot(p) {
  if (p.raceDistanceKm && p.raceTimeSec) return vdotFromRace(p.raceDistanceKm, p.raceTimeSec);
  return defaultVdot(deriveLevel(p));
}

// Realistic VDOT gain over the plan: ~1 point every 3-4 weeks, more for novices.
export function maxVdotGain(level, weeks) {
  const perWeek = { principiante: 0.4, intermedio: 0.3, avanzato: 0.2 }[level];
  return perWeek * weeks;
}

export function goalAssessment(p, weeks) {
  const level = deriveLevel(p);
  const now = currentVdot(p);
  const reachable = now + maxVdotGain(level, weeks);
  const predictedNow = predictRaceTime(now, HM_KM);
  const predictedEnd = predictRaceTime(reachable, HM_KM);
  // Without a time goal assume only half of the possible gain when setting paces.
  if (!p.goalTimeSec) {
    const target = now + (reachable - now) / 2;
    return { now, target, feasible: true, predictedNow, predictedEnd: predictRaceTime(target, HM_KM) };
  }
  const goalVdot = vdotFromRace(HM_KM, p.goalTimeSec);
  return {
    now,
    goalVdot,
    target: Math.min(goalVdot, reachable),
    feasible: goalVdot <= reachable + 0.25,
    predictedNow,
    predictedEnd,
  };
}

// ---------- phases ----------
export function phaseFor(weekIdx, total) {
  const taper = total >= 10 ? 2 : 1;
  if (weekIdx >= total - taper) return 'taper';
  const work = total - taper;
  const base = Math.max(1, Math.round(work * 0.35));
  const build = Math.max(1, Math.round(work * 0.4));
  if (weekIdx < base) return 'base';
  if (weekIdx < base + build) return 'build';
  return 'specifica';
}

export const PHASE_LABEL = { base: 'Base aerobica', build: 'Sviluppo', specifica: 'Specifica mezza', taper: 'Scarico' };

// ---------- volume progression ----------
// Returns [{weekly, long, down}] for each week before race week + race week.
export function progression(p, total) {
  const level = deriveLevel(p);
  const L = LEVEL[level];
  const days = p.runDays.length;
  const taper = total >= 10 ? 2 : 1;
  const buildWeeks = total - taper;

  // Frequency limits how much volume is sensible.
  const peakWeekly = Math.max(p.weeklyKm, Math.min(L.peakWeekly, days * (level === 'principiante' ? 11 : 13)));
  const longStart = Math.max(level === 'principiante' ? 3 : 5, Math.min(p.longestRunKm || 0, 30));
  let weekly = Math.max(p.weeklyKm, longStart + (days - 1) * L.minEasy);
  // Down week every 4th week (every 3rd from 50 years old).
  const cycle = p.age >= 50 ? 3 : 4;

  const out = [];
  const history = []; // longest run of each week, for the 30-day rule
  let sinceDown = 0;

  for (let w = 0; w < buildWeeks; w++) {
    const isDown = w > 0 && sinceDown === cycle - 1 && w < buildWeeks - 1;
    const max30 = Math.max(...history.slice(-4), w === 0 ? longStart : 0);
    let wk, lg;
    if (w === 0) {
      wk = weekly;
      lg = Math.min(longStart, L.peakLong, wk * L.maxLongFrac);
    } else if (isDown) {
      wk = weekly * 0.75;
      lg = max30 * 0.7;
    } else {
      if (w > 1 || p.weeklyKm >= weekly) weekly = Math.min(peakWeekly, weekly * 1.1);
      wk = weekly;
      // Longest run of the previous 30 days +10% at most (Frandsen 2025).
      lg = Math.min(L.peakLong, max30 * 1.1, Math.max(wk * L.maxLongFrac, Math.min(max30, wk * 0.6)));
    }
    lg = f01(lg);
    wk = Math.max(wk, lg + (days - 1) * L.minEasy);
    out.push({ weekly: r05(wk), long: lg, down: isDown });
    history.push(lg);
    sinceDown = isDown ? 0 : sinceDown + 1;
  }

  const peak = Math.max(...out.map((o) => o.weekly));
  const peakLong = Math.max(...out.map((o) => o.long));
  if (taper === 2) {
    out.push({ weekly: r05(peak * 0.7), long: f01(Math.min(peakLong * 0.75, 14)), down: true });
  }
  out.push({ weekly: r05(peak * 0.45), long: 0, down: true }); // race week, race excluded
  return out;
}

// ---------- day assignment ----------
// Pick quality days as far as possible (circularly) from the long run and from each other.
export function assignDays(runDays, longDay, nQuality) {
  const days = [...runDays].sort((a, b) => a - b);
  const long = days.includes(longDay) ? longDay : days[days.length - 1];
  const dist = (a, b) => {
    const d = Math.abs(a - b);
    return Math.min(d, 7 - d);
  };
  const hard = [long];
  const quality = [];
  for (let q = 0; q < nQuality; q++) {
    let best = null, bestScore = -1;
    for (const d of days) {
      if (hard.includes(d)) continue;
      const score = Math.min(...hard.map((h) => dist(d, h)));
      // Prefer not to place quality the day right before the long run.
      const penalty = d === (long + 6) % 7 ? 0.5 : 0;
      if (score - penalty > bestScore) { bestScore = score - penalty; best = d; }
    }
    if (best === null || bestScore < 1.5) break; // never back-to-back hard days
    hard.push(best);
    quality.push(best);
  }
  const easy = days.filter((d) => d !== long && !quality.includes(d));
  return { long, quality: quality.sort((a, b) => a - b), easy };
}

// ---------- workouts ----------
// A workout: { type, title, km, steps:[{kind:'warmup'|'run'|'recovery'|'cooldown'|'walk', km?|sec?, zone, reps?}], notes }
function easyRun(km, opts = {}) {
  const steps = [{ kind: 'run', km, zone: 'E' }];
  if (opts.strides) {
    steps.push({ kind: 'repeat', reps: opts.strides, steps: [{ kind: 'run', sec: 20, zone: 'S' }, { kind: 'recovery', sec: 70, zone: 'walk' }] });
  }
  return {
    type: 'easy',
    title: opts.strides ? 'Corsa facile + allunghi' : 'Corsa facile',
    km: r05(km + (opts.strides ? 0.4 : 0)),
    steps,
    notes: 'Ritmo da conversazione (RPE 3-4/10). Se il ritmo indicato ti sembra duro, rallenta: conta lo sforzo, non il cronometro.',
  };
}

function runWalk(km, runMin, walkMin) {
  const reps = Math.max(2, Math.round((km * 7.5) / (runMin + walkMin)));
  return {
    type: 'easy',
    title: `Corsa/cammino ${runMin}'/${walkMin}'`,
    km: r05(km),
    steps: [
      { kind: 'warmup', sec: 300, zone: 'walk' },
      { kind: 'repeat', reps, steps: [{ kind: 'run', sec: runMin * 60, zone: 'E' }, { kind: 'recovery', sec: walkMin * 60, zone: 'walk' }] },
    ],
    notes: 'Alternare corsa e cammino riduce il carico sui tessuti mentre costruisci la base. Corri molto piano.',
  };
}

function longRun(km, phase, level) {
  if (phase === 'specifica' && level !== 'principiante' && km >= 12) {
    const fast = clamp(Math.round(km * 0.2), 2, 5);
    return {
      type: 'long',
      title: 'Lungo con finale a ritmo gara',
      km,
      steps: [{ kind: 'run', km: km - fast, zone: 'L' }, { kind: 'run', km: fast, zone: 'HM' }],
      notes: 'Ultimi chilometri a ritmo mezza: prova scarpe, gel e idratazione che userai in gara.',
    };
  }
  return {
    type: 'long',
    title: 'Lungo lento',
    km,
    steps: [{ kind: 'run', km, zone: 'L' }],
    notes: km >= 14
      ? 'Ritmo facile e costante. Oltre i 75-90 minuti porta acqua e carboidrati (30-60 g/h).'
      : 'Ritmo facile e costante: deve finire con la sensazione di poterne fare ancora.',
  };
}

const WU = (km) => ({ kind: 'warmup', km, zone: 'E' });
const CD = (km) => ({ kind: 'cooldown', km, zone: 'E' });

function qualityWorkout(kind, weekly, step, level, cap = Infinity) {
  // step: 0..1 progress within the phase, used to grow the session.
  // cap: the session never exceeds this distance (the week's long run).
  const wu = level === 'principiante' ? 1.5 : 2;
  const cd = level === 'principiante' ? 1 : 1.5;
  const avail = Math.max(1.5, cap - wu - cd);
  switch (kind) {
    case 'fartlek': {
      const reps = clamp(Math.round(6 + step * 4), 3, Math.floor(avail / 0.4));
      const workKm = reps * 0.2;
      return {
        type: 'quality', title: `Fartlek ${reps} × 1'`, km: r05(wu + cd + workKm + reps * 0.2),
        steps: [WU(wu), { kind: 'repeat', reps, steps: [{ kind: 'run', sec: 60, zone: 'F' }, { kind: 'recovery', sec: 90, zone: 'E' }] }, CD(cd)],
        notes: 'Tratti veloci a sensazione “sostenuto ma controllato” (RPE 7/10).',
      };
    }
    case 'hills': {
      const reps = clamp(Math.round(6 + step * 4), 3, Math.floor(avail / 0.3));
      return {
        type: 'quality', title: `Salite ${reps} × 45"`, km: r05(wu + cd + reps * 0.3),
        steps: [WU(wu), { kind: 'repeat', reps, steps: [{ kind: 'run', sec: 45, zone: 'I', note: 'in salita (pendenza 4-8%)' }, { kind: 'recovery', sec: 90, zone: 'walk', note: 'ritorno al passo/corsetta' }] }, CD(cd)],
        notes: 'Salita breve e decisa (RPE 8/10), busto alto, passi corti. Rinforza tendini e muscoli con meno impatto.',
      };
    }
    case 'tempo': {
      // Threshold: total 15'..35' in cruise intervals, <= ~10% weekly km.
      const tKm = clamp(r05(weekly * 0.1 + step * 1.5), 2, Math.min(level === 'avanzato' ? 9 : 7, f05(avail * 0.85)));
      const repKm = tKm >= 6 ? 2 : tKm >= 4 ? 1.5 : 1;
      const reps = Math.max(2, Math.round(tKm / repKm));
      return {
        type: 'quality', title: `Soglia ${reps} × ${repKm} km`, km: r05(wu + cd + reps * repKm + reps * 0.2),
        steps: [WU(wu), { kind: 'repeat', reps, steps: [{ kind: 'run', km: repKm, zone: 'T' }, { kind: 'recovery', sec: 60, zone: 'E' }] }, CD(cd)],
        notes: 'Ritmo “comodamente duro” (RPE 7/10): riesci a dire poche parole. Allena la soglia del lattato.',
      };
    }
    case 'intervals': {
      const iKm = clamp(r05(weekly * 0.07 + step), 2.4, Math.min(level === 'avanzato' ? 6 : 5, f05(avail * 0.75)));
      const repM = iKm >= 5 ? 1000 : 800;
      const reps = Math.max(3, Math.floor((iKm * 1000) / repM));
      return {
        type: 'quality', title: `Ripetute ${reps} × ${repM} m`, km: r05(wu + cd + (reps * repM) / 1000 + reps * 0.3),
        steps: [WU(wu), { kind: 'repeat', reps, steps: [{ kind: 'run', km: repM / 1000, zone: 'I' }, { kind: 'recovery', sec: repM === 1000 ? 150 : 120, zone: 'E' }] }, CD(cd)],
        notes: 'Sforzo duro ma uniforme (RPE 8/10): l’ultima ripetuta deve essere veloce quanto la prima.',
      };
    }
    case 'hmpace': {
      const hmKm = clamp(r05(4 + step * 6), 2, Math.min(level === 'avanzato' ? 12 : 9, f05(avail * 0.9)));
      const blocks = hmKm >= 8 ? 2 : hmKm >= 6 ? 2 : 1;
      const blockKm = r05(hmKm / blocks);
      const main = blocks === 1
        ? [{ kind: 'run', km: blockKm, zone: 'HM' }]
        : [{ kind: 'repeat', reps: blocks, steps: [{ kind: 'run', km: blockKm, zone: 'HM' }, { kind: 'recovery', sec: 180, zone: 'E' }] }];
      return {
        type: 'quality', title: `Ritmo gara ${blocks > 1 ? `${blocks} × ` : ''}${blockKm} km`, km: r05(wu + cd + blockKm * blocks + (blocks - 1) * 0.5),
        steps: [WU(wu), ...main, CD(cd)],
        notes: 'Impara il ritmo della mezza: regolare, rilassato, senza partire forte.',
      };
    }
    case 'progressive': {
      const total = clamp(r05(weekly * 0.15 + 2), 4, Math.min(10, f05(cap)));
      return {
        type: 'quality', title: `Progressivo ${total} km`, km: total,
        steps: [{ kind: 'run', km: r05(total * 0.5), zone: 'E' }, { kind: 'run', km: r05(total * 0.3), zone: 'M' }, { kind: 'run', km: r05(total * 0.2), zone: 'T' }],
        notes: 'Parti facile e chiudi forte: ogni terzo un po’ più veloce del precedente.',
      };
    }
    default:
      throw new Error(`unknown workout ${kind}`);
  }
}

function sessionKindsFor(phase, level, nQuality, w) {
  const alt = w % 2;
  if (level === 'principiante') {
    if (phase === 'base') return [];
    if (phase === 'build') return [alt ? 'hills' : 'fartlek'].slice(0, nQuality);
    if (phase === 'specifica') return [alt ? 'hmpace' : 'tempo'].slice(0, nQuality);
    return ['hmpace'].slice(0, nQuality);
  }
  if (phase === 'base') return [alt ? 'hills' : 'fartlek', 'progressive'].slice(0, Math.min(1, nQuality));
  if (phase === 'build') return ['tempo', alt ? 'hills' : 'intervals'].slice(0, nQuality);
  if (phase === 'specifica') return ['hmpace', alt ? 'intervals' : 'tempo'].slice(0, nQuality);
  return ['hmpace'].slice(0, nQuality);
}

export const STRENGTH = {
  type: 'strength',
  title: 'Forza per runner (25\')',
  km: 0,
  steps: [],
  exercises: [
    ['Squat (o goblet squat)', '3 × 10-12'],
    ['Affondi indietro', '3 × 8 per gamba'],
    ['Stacco rumeno su una gamba', '3 × 8 per gamba'],
    ['Polpacci su una gamba (gradino)', '3 × 15 per gamba'],
    ['Ponte glutei su una gamba', '3 × 10 per gamba'],
    ['Plank frontale', '3 × 30-45"'],
    ['Plank laterale', '2 × 30" per lato'],
  ],
  notes: 'Ultime ripetizioni impegnative ma con tecnica pulita. Quando diventa facile, aggiungi carico (zaino, manubri). Riduce il rischio di infortuni e migliora l’economia di corsa.',
};

// ---------- main entry ----------
export function generatePlan(profile) {
  const p = { ...profile };
  const level = deriveLevel(p);
  const L = LEVEL[level];
  const today = p.today || toISO(new Date());
  const start = mondayOf(p.startDate || today);
  const raceWeek = mondayOf(p.raceDate);
  const total = Math.floor(daysBetween(start, raceWeek) / 7) + 1;
  if (total < 4) throw new Error('Servono almeno 4 settimane prima della gara.');
  if (total > 30) throw new Error('Gara troppo lontana: scegli una data entro 30 settimane.');
  if (!p.runDays?.length || p.runDays.length < 3) throw new Error('Scegli almeno 3 giorni di corsa a settimana.');

  const prog = progression(p, total);
  const assess = goalAssessment(p, total);
  const runWalkWeeks = level === 'principiante' && !p.canRun30 ? Math.min(4, total - 3) : 0;

  const weeks = [];
  const phaseCounts = {};
  for (let w = 0; w < total; w++) {
    const phase = phaseFor(w, total);
    phaseCounts[phase] = (phaseCounts[phase] || 0) + 1;
    const phaseLen = Array.from({ length: total }, (_, i) => phaseFor(i, total)).filter((x) => x === phase).length;
    const stepInPhase = phaseLen > 1 ? (phaseCounts[phase] - 1) / (phaseLen - 1) : 1;
    const { weekly, long, down } = prog[w];
    const weekStart = addDays(start, w * 7);
    const isRaceWeek = w === total - 1;

    let nQuality = Math.min(L.maxQuality, p.runDays.length >= 4 ? 2 : 1);
    if (down && !isRaceWeek) nQuality = Math.min(nQuality, 1);
    const kinds = isRaceWeek ? [] : sessionKindsFor(phase, level, nQuality, w);
    const { long: longDay, quality: qDays, easy: eDays } = assignDays(p.runDays, p.longRunDay ?? 6, kinds.length);

    const sessions = [];
    const push = (day, workout) => {
      const date = addDays(weekStart, day);
      if (date < (p.startDate || today)) return;
      sessions.push({ id: `${date}-${workout.type}`, date, day, ...workout });
    };

    if (isRaceWeek) {
      const raceDay = weekdayIndex(p.raceDate);
      const runBefore = p.runDays.filter((d) => d < raceDay).sort((a, b) => b - a);
      // Tune-up 3-4 days before, easy runs otherwise, 1 shake-out the day before if it is a run day.
      const tuneDay = runBefore.find((d) => raceDay - d >= 3 && raceDay - d <= 5);
      for (const d of runBefore) {
        if (d === tuneDay) {
          push(d, {
            type: 'quality', title: 'Rifinitura 3 × 1 km ritmo gara', km: 6,
            steps: [WU(2), { kind: 'repeat', reps: 3, steps: [{ kind: 'run', km: 1, zone: 'HM' }, { kind: 'recovery', sec: 120, zone: 'E' }] }, CD(1)],
            notes: 'Solo per sentire il ritmo: niente di più.',
          });
        } else if (raceDay - d === 1) {
          push(d, easyRun(3, { strides: 4 }));
          sessions[sessions.length - 1].title = 'Sgambata pre-gara';
        } else if (raceDay - d > 1) {
          push(d, easyRun(clamp(r05(weekly / Math.max(1, runBefore.length)), 3, 6)));
        }
      }
      push(raceDay, {
        type: 'race', title: 'MEZZA MARATONA', km: HM_KM,
        steps: [{ kind: 'run', km: 3, zone: 'HM', note: 'primi 3 km leggermente sotto ritmo' }, { kind: 'run', km: 15, zone: 'HM' }, { kind: 'run', km: 3.1, zone: 'HM', note: 'se ne hai, spingi' }],
        notes: 'Colazione collaudata 2-3 h prima. Partenza prudente, 30-60 g/h di carboidrati dopo i primi 40-45\'. Goditela!',
      });
    } else {
      const longW = long;
      const qWorkouts = kinds.map((k) => qualityWorkout(k, weekly, stepInPhase, level, longW));
      const qKm = qWorkouts.reduce((s, x) => s + x.km, 0);
      const easyKmTotal = Math.max(0, weekly - longW - qKm);
      const nEasy = eDays.length;
      const per = nEasy ? Math.max(L.minEasy, easyKmTotal / nEasy) : 0;

      const useRunWalk = w < runWalkWeeks;
      if (useRunWalk) {
        const runMin = [3, 4, 6, 8][w] ?? 8;
        push(longDay, { ...runWalk(longW, runMin, 1), type: 'long', title: `Lungo corsa/cammino ${runMin}'/1'` });
      } else {
        push(longDay, longRun(longW, phase, level));
      }
      qDays.forEach((d, i) => push(d, qWorkouts[i]));
      eDays.forEach((d, i) => {
        // Longest of the easy runs never exceeds the long run.
        const km = Math.min(r05(per), Math.max(L.minEasy, longW - 1));
        if (useRunWalk) push(d, runWalk(km, [3, 4, 6, 8][w] ?? 8, 1));
        else push(d, easyRun(km, { strides: i === 0 && phase !== 'taper' && level !== 'principiante' ? 6 : i === 0 && phase !== 'base' ? 4 : 0 }));
      });
    }

    // Strength: two non-consecutive days, preferably non-run days or easy days; one in taper; none in race week.
    const strengthN = isRaceWeek ? 0 : phase === 'taper' ? 1 : 2;
    const hardDays = sessions.filter((s) => s.type !== 'easy').map((s) => s.day);
    const candidates = [0, 1, 2, 3, 4, 5, 6]
      .filter((d) => !hardDays.includes(d) && !hardDays.includes((d + 1) % 7))
      .sort((a, b) => (p.runDays.includes(a) ? 1 : 0) - (p.runDays.includes(b) ? 1 : 0));
    const sDays = [];
    for (const d of candidates) {
      if (sDays.length >= strengthN) break;
      if (sDays.some((x) => Math.min(Math.abs(x - d), 7 - Math.abs(x - d)) < 2)) continue;
      sDays.push(d);
    }
    if (p.strength !== false) sDays.forEach((d) => push(d, { ...STRENGTH }));

    sessions.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.type === 'strength' ? 1 : -1));
    const runKm = sessions.filter((s) => s.type !== 'strength' && s.type !== 'race').reduce((s, x) => s + x.km, 0);
    weeks.push({
      index: w,
      start: weekStart,
      phase,
      down,
      targetKm: weekly,
      plannedKm: r05(runKm),
      sessions,
    });
  }

  // Interpolated VDOT per week: current fitness → realistic target.
  weeks.forEach((wk, i) => {
    const f = total > 1 ? Math.min(1, i / (total - 2 || 1)) : 1;
    wk.vdot = +(assess.now + (assess.target - assess.now) * f).toFixed(2);
  });

  return {
    version: 1,
    createdAt: today,
    level,
    raceDate: p.raceDate,
    start,
    totalWeeks: total,
    assessment: assess,
    warnings: planWarnings(p, level, total, prog),
    weeks,
  };
}

export function planWarnings(p, level, total, prog) {
  const w = [];
  if (total < 8) w.push('Meno di 8 settimane: il piano è compresso, priorità a finire la gara in salute più che al tempo.');
  if (level === 'principiante' && !p.canRun30) w.push('Prima settimane in corsa/cammino: costruiamo la base prima di aumentare i chilometri.');
  const peakLong = Math.max(...prog.map((x) => x.long));
  if (peakLong < 15) w.push(`Con il tempo disponibile il lungo massimo sicuro è ${peakLong} km: aumentarlo più in fretta violerebbe la regola del +10% sul lungo dei 30 giorni precedenti. Va bene per finire la gara; considera una data più lontana se vuoi un tempo.`);
  if (p.injury) w.push('Hai segnalato un infortunio recente: confrontati con un medico o fisioterapista prima di iniziare.');
  return w;
}

// ---------- adaptation ----------
// Summarise logs over the last `days` days before `today`.
export function recentLoad(logs, today, days = 28) {
  const from = addDays(today, -days);
  const runs = Object.values(logs).filter((l) => l.done && l.km > 0 && l.date >= from && l.date < today);
  const km = runs.reduce((s, l) => s + l.km, 0);
  const longest = runs.reduce((m, l) => Math.max(m, l.km), 0);
  return { weeklyKm: km / (days / 7), longestRunKm: longest, runs: runs.length };
}

// Signals that the plan should be eased. Returns null or {reason, factor}.
export function adaptationSignal(plan, logs, today) {
  // Only look at what happened since the last adaptation.
  const from = [addDays(today, -14), plan.replannedAt || ''].sort().pop();
  const past = plan.weeks.flatMap((w) => w.sessions).filter((s) => s.date < today && s.date >= from && s.type !== 'strength');
  if (!past.length) return null;
  const pain = past.some((s) => logs[s.id]?.pain);
  const missed = past.filter((s) => !logs[s.id]?.done).length;
  const easyRpe = past.filter((s) => s.type === 'easy' && logs[s.id]?.done && logs[s.id].rpe).map((s) => logs[s.id].rpe);
  const avgEasy = easyRpe.length ? easyRpe.reduce((a, b) => a + b, 0) / easyRpe.length : 0;
  if (pain) return { reason: 'Hai segnalato dolore', factor: 0.7, advice: 'Riduciamo il carico e togliamo le sedute intense. Se il dolore persiste oltre 3-5 giorni o peggiora correndo, fermati e consulta un professionista.' };
  if (missed >= Math.max(2, Math.ceil(past.length / 2))) return { reason: `${missed} allenamenti saltati nelle ultime 2 settimane`, factor: 0.85, advice: 'Ripartiamo da un carico un po’ più basso invece di recuperare i chilometri persi.' };
  if (avgEasy >= 6.5) return { reason: 'Le corse facili risultano faticose (RPE medio ' + avgEasy.toFixed(1) + ')', factor: 0.9, advice: 'Segnale di fatica accumulata: una settimana più leggera ti farà assorbire il lavoro.' };
  return null;
}

// Rebuild the remaining plan from `today` using what the runner actually did.
export function replan(profile, oldPlan, logs, today, factor = 1) {
  const load = recentLoad(logs, today);
  const p = {
    ...profile,
    today,
    startDate: today,
    weeklyKm: load.runs >= 3 ? load.weeklyKm * factor : profile.weeklyKm * factor,
    longestRunKm: load.runs >= 3 ? load.longestRunKm * factor : profile.longestRunKm * factor,
  };
  const fresh = generatePlan(p);
  const thisMonday = mondayOf(today);
  const kept = oldPlan.weeks.filter((w) => w.start < thisMonday);
  // Keep sessions of the current week that are already in the past.
  const cur = oldPlan.weeks.find((w) => w.start === thisMonday);
  if (cur && fresh.weeks[0]) {
    const pastSessions = cur.sessions.filter((s) => s.date < today);
    fresh.weeks[0].sessions = [...pastSessions, ...fresh.weeks[0].sessions.filter((s) => s.date >= today)];
  }
  const offset = kept.length;
  fresh.weeks.forEach((w, i) => { w.index = offset + i; });
  return { ...fresh, start: oldPlan.start, totalWeeks: offset + fresh.weeks.length, weeks: [...kept, ...fresh.weeks], createdAt: oldPlan.createdAt, replannedAt: today };
}
