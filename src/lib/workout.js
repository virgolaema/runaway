import { trainingPaces } from './vdot.js';

export const ZONE_LABEL = {
  E: 'Facile', L: 'Lungo', M: 'Ritmo maratona', HM: 'Ritmo mezza', T: 'Soglia',
  F: 'Sostenuto (~10 km)', I: 'Ripetute', S: 'Allungo', walk: 'Cammino',
};
export const ZONE_RPE = { E: '3-4', L: '3-4', M: '6', HM: '6-7', T: '7', F: '7', I: '8', S: '8', walk: '1-2' };
// %HRmax ranges (ACSM / Daniels-equivalent)
const ZONE_HR = { E: [0.65, 0.78], L: [0.65, 0.78], M: [0.8, 0.85], HM: [0.83, 0.88], T: [0.86, 0.9], F: [0.88, 0.92], I: [0.92, 0.97] };

export const TYPE_LABEL = { easy: 'Facile', long: 'Lungo', quality: 'Qualità', strength: 'Forza', race: 'Gara' };

export function hrMax(age) {
  return age ? Math.round(208 - 0.7 * age) : null; // Tanaka et al. 2001
}

export function hrRange(zone, age) {
  const m = hrMax(age);
  const z = ZONE_HR[zone];
  if (!m || !z) return null;
  return [Math.round(m * z[0]), Math.round(m * z[1])];
}

const WALK_PACE = 600;

export function zonePace(zone, vdot) {
  if (zone === 'walk') return [WALK_PACE, WALK_PACE];
  return trainingPaces(vdot)[zone];
}

function midPace(zone, vdot) {
  const [a, b] = zonePace(zone, vdot);
  return (a + b) / 2;
}

// Flatten structured steps into a linear list of segments for the guided run.
export function flatten(steps) {
  const out = [];
  for (const s of steps) {
    if (s.kind === 'repeat') {
      for (let r = 0; r < s.reps; r++) {
        for (const sub of s.steps) out.push({ ...sub, rep: r + 1, reps: s.reps });
      }
    } else out.push({ ...s });
  }
  return out;
}

export function segmentSeconds(seg, vdot) {
  if (seg.sec) return seg.sec;
  return seg.km * midPace(seg.zone, vdot);
}

export function segmentKm(seg, vdot) {
  if (seg.km) return seg.km;
  return seg.sec / midPace(seg.zone, vdot);
}

export function estimateSeconds(workout, vdot) {
  if (workout.type === 'strength') return 25 * 60;
  return flatten(workout.steps).reduce((s, seg) => s + segmentSeconds(seg, vdot), 0);
}

export const KIND_LABEL = { warmup: 'Riscaldamento', cooldown: 'Defaticamento', run: '', recovery: 'Recupero', walk: 'Cammino' };

export function segmentTitle(seg) {
  const base = KIND_LABEL[seg.kind] || ZONE_LABEL[seg.zone];
  return base || ZONE_LABEL[seg.zone];
}
