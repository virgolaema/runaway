// Daniels & Gilbert running formula ("VDOT").
// Daniels J. & Gilbert J. (1979), Oxygen Power; Daniels' Running Formula, 4th ed. (2022).

// Oxygen cost (ml/kg/min) of running at speed v (m/min).
export function vo2AtSpeed(v) {
  return -4.6 + 0.182258 * v + 0.000104 * v * v;
}

// Fraction of VO2max sustainable for a race lasting t minutes.
export function fractionForDuration(t) {
  return 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t);
}

// Speed (m/min) whose oxygen cost equals vo2.
export function speedForVo2(vo2) {
  const a = 0.000104, b = 0.182258, c = -(4.6 + vo2);
  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
}

export function vdotFromRace(distanceKm, timeSec) {
  const t = timeSec / 60;
  const v = (distanceKm * 1000) / t;
  return vo2AtSpeed(v) / fractionForDuration(t);
}

// Predicted race time (s) for a distance given a VDOT, by bisection.
export function predictRaceTime(vdot, distanceKm) {
  const d = distanceKm * 1000;
  let lo = 1, hi = 1000; // minutes
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    const implied = vo2AtSpeed(d / mid) / fractionForDuration(mid);
    if (implied > vdot) lo = mid; else hi = mid;
  }
  return ((lo + hi) / 2) * 60;
}

// Seconds per km at a given fraction of VDOT.
export function paceAtFraction(vdot, f) {
  return 60000 / speedForVo2(vdot * f);
}

// Pace (s/km) sustainable for a race of t minutes.
function paceForRaceDuration(vdot, t) {
  return paceAtFraction(vdot, fractionForDuration(t));
}

// Training zones in s/km. Ranges are [fast, slow].
export function trainingPaces(vdot) {
  const hm = predictRaceTime(vdot, 21.0975) / 21.0975;
  const mar = predictRaceTime(vdot, 42.195) / 42.195;
  const tenK = predictRaceTime(vdot, 10) / 10;
  return {
    E: [paceAtFraction(vdot, 0.70), paceAtFraction(vdot, 0.62)],
    L: [paceAtFraction(vdot, 0.68), paceAtFraction(vdot, 0.60)],
    M: [mar - 3, mar + 3],
    HM: [hm - 3, hm + 3],
    T: [paceForRaceDuration(vdot, 60) - 3, paceForRaceDuration(vdot, 60) + 4],
    F: [tenK - 5, tenK + 5], // fartlek / 10k effort
    I: [paceAtFraction(vdot, 0.995) - 3, paceAtFraction(vdot, 0.975) + 2],
    S: [paceAtFraction(vdot, 1.12), paceAtFraction(vdot, 1.05)], // strides
  };
}

// Rough starting VDOT when the runner has no recent race result.
export function defaultVdot(level) {
  return { principiante: 31, intermedio: 39, avanzato: 47 }[level] ?? 35;
}
