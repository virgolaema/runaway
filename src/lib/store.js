const KEY = 'runaway.v1';

const empty = () => ({ profile: null, plan: null, logs: {}, history: [] });

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...empty(), ...JSON.parse(raw) } : empty();
  } catch {
    return empty();
  }
}

export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // storage full or unavailable: keep running in memory
  }
}

export function reset() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  return empty();
}
