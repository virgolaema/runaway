// Native integrations with web fallbacks: GPS, voice, haptics, screen wake lock.
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { Haptics } from '@capacitor/haptics';

const native = Capacitor.isNativePlatform();

export function speak(text) {
  if (native) {
    TextToSpeech.speak({ text, lang: 'it-IT', rate: 1.0, category: 'playback' }).catch(() => {});
  } else if ('speechSynthesis' in window) {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'it-IT';
    window.speechSynthesis.speak(u);
  }
}

export function buzz(long = false) {
  if (native) Haptics.vibrate({ duration: long ? 600 : 250 }).catch(() => {});
  else navigator.vibrate?.(long ? 600 : 250);
}

let audioCtx;
export function beep(freq = 880, ms = 180) {
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.frequency.value = freq;
    g.gain.value = 0.15;
    o.connect(g).connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + ms / 1000);
  } catch { /* no audio */ }
}

let wakeLock = null;
export async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
    else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch { /* not supported */ }
}

function haversine(a, b) {
  const R = 6371000, toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Distance tracker. onUpdate({ meters, accuracy, speed }) — speed in m/s from recent points.
export class GpsTracker {
  constructor(onUpdate) {
    this.onUpdate = onUpdate;
    this.meters = 0;
    this.last = null;
    this.recent = [];
    this.paused = false;
    this.id = null;
  }

  async start() {
    const handle = (pos) => {
      if (!pos) return;
      const c = pos.coords;
      const pt = { lat: c.latitude, lon: c.longitude, t: pos.timestamp, acc: c.accuracy };
      if (pt.acc > 35) { this.onUpdate({ meters: this.meters, accuracy: pt.acc, speed: null }); return; }
      if (this.last && !this.paused) {
        const d = haversine(this.last, pt);
        const dt = (pt.t - this.last.t) / 1000;
        if (dt > 0 && d / dt < 9 && d > 1.5) this.meters += d; // ignore jumps and jitter
      }
      this.last = pt;
      this.recent.push({ t: pt.t, m: this.meters });
      this.recent = this.recent.filter((r) => pt.t - r.t <= 30000);
      const first = this.recent[0];
      const speed = pt.t - first.t > 8000 ? (this.meters - first.m) / ((pt.t - first.t) / 1000) : null;
      this.onUpdate({ meters: this.meters, accuracy: pt.acc, speed });
    };
    try {
      if (native) {
        const perm = await Geolocation.requestPermissions({ permissions: ['location'] });
        if (perm.location !== 'granted') throw new Error('permesso negato');
        this.id = await Geolocation.watchPosition({ enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }, (pos, err) => {
          if (!err) handle(pos);
        });
      } else if ('geolocation' in navigator) {
        this.id = navigator.geolocation.watchPosition(handle, () => {}, { enableHighAccuracy: true, maximumAge: 0 });
      } else throw new Error('GPS non disponibile');
      return true;
    } catch (e) {
      this.error = e.message;
      return false;
    }
  }

  setPaused(p) {
    this.paused = p;
    if (p) this.last = null;
  }

  async stop() {
    if (this.id == null) return;
    if (native) await Geolocation.clearWatch({ id: this.id }).catch(() => {});
    else navigator.geolocation.clearWatch(this.id);
    this.id = null;
  }
}
