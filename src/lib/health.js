// Health Connect bridge: reads runs that Garmin Connect (or any other watch app) shares.
import { Capacitor } from '@capacitor/core';
import { Health } from '@capgo/capacitor-health';

export const READ = ['workouts', 'distance', 'heartRate', 'calories'];

export const isNative = () => Capacitor.getPlatform() === 'android';

export async function availability() {
  if (!isNative()) return { available: false, reason: 'web' };
  try {
    return await Health.isAvailable();
  } catch (e) {
    return { available: false, reason: e.message };
  }
}

export async function connect() {
  const st = await Health.requestAuthorization({ read: READ, requestHistoryAccess: false });
  return st.readAuthorized.includes('workouts');
}

export async function isAuthorized() {
  if (!isNative()) return false;
  try {
    const st = await Health.checkAuthorization({ read: READ });
    return st.readAuthorized.includes('workouts');
  } catch {
    return false;
  }
}

export function openSettings() {
  return Health.openHealthConnectSettings().catch(() => {});
}

async function averageHr(startDate, endDate) {
  try {
    const { samples } = await Health.readSamples({ dataType: 'heartRate', startDate, endDate, limit: 5000 });
    if (!samples.length) return null;
    return samples.reduce((s, x) => s + x.value, 0) / samples.length;
  } catch {
    return null;
  }
}

// Running workouts between two dates (Date objects).
export async function readRuns(from, to) {
  const out = [];
  for (const type of ['running', 'runningTreadmill']) {
    let anchor;
    do {
      const res = await Health.queryWorkouts({
        workoutType: type,
        startDate: from.toISOString(),
        endDate: to.toISOString(),
        limit: 100,
        ascending: true,
        anchor,
      });
      for (const w of res.workouts) {
        out.push({
          id: w.platformId || `${w.startDate}-${w.duration}`,
          start: w.startDate,
          durationSec: w.duration,
          meters: w.totalDistance || 0,
          avgHr: await averageHr(w.startDate, w.endDate),
          source: w.sourceName || w.sourceId || 'orologio',
        });
      }
      anchor = res.anchor || undefined;
    } while (anchor);
  }
  return out;
}
