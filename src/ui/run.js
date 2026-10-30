import { flatten, segmentSeconds, segmentKm, zonePace, ZONE_LABEL, segmentTitle } from '../lib/workout.js';
import { pace, paceRange, duration, km, esc } from '../lib/format.js';
import { GpsTracker, speak, buzz, beep, keepAwake } from '../lib/device.js';
import { findSession } from './common.js';

let run = null; // active run state

function describe(seg, vdot) {
  const amount = seg.km ? `${km(seg.km)} chilometri` : seg.sec >= 60 ? `${Math.round(seg.sec / 60)} minuti` : `${seg.sec} secondi`;
  const what = seg.kind === 'run' ? ZONE_LABEL[seg.zone] : segmentTitle(seg);
  const rep = seg.reps && seg.kind === 'run' ? `Ripetuta ${seg.rep} di ${seg.reps}. ` : '';
  const p = seg.zone === 'walk' ? '' : `, ${speakPace(zonePace(seg.zone, vdot))}`;
  return `${rep}${what}: ${amount}${p}`;
}

function speakPace([a, b]) {
  const f = (s) => { s = Math.round(s); return `${Math.floor(s / 60)} e ${s % 60}`; };
  return `tra ${f(a)} e ${f(b)} al chilometro`;
}

function now() { return Date.now(); }

function elapsed() {
  return run.acc + (run.paused || !run.startedAt ? 0 : (now() - run.resumedAt) / 1000);
}

function segElapsed() {
  return elapsed() - run.segStartT;
}

function segDist() {
  return run.meters - run.segStartM;
}

function segUsesDistance(seg) {
  return !!seg.km && run.gpsOn && run.gpsOk;
}

function startSegment(i) {
  run.idx = i;
  run.segStartT = elapsed();
  run.segStartM = run.meters;
  run.lastCountdown = null;
  run.paceWarnAt = elapsed();
  const seg = run.segs[i];
  if (!seg) return finish(false);
  buzz(true);
  beep(seg.kind === 'run' && seg.zone !== 'E' && seg.zone !== 'L' ? 1046 : 660, 250);
  speak(describe(seg, run.vdot));
}

function finish(manual) {
  run.finished = true;
  run.acc = elapsed();
  run.paused = true;
  clearInterval(run.timer);
  run.gps?.stop();
  keepAwake(false);
  speak(manual ? 'Allenamento terminato.' : 'Allenamento completato. Ottimo lavoro!');
  buzz(true);
  const plannedKm = run.segs.reduce((s, seg) => s + segmentKm(seg, run.vdot), 0);
  // Without GPS estimate the distance from the blocks completed at target pace.
  const seg = run.segs[run.idx];
  const partial = manual && seg ? segmentKm(seg, run.vdot) * Math.min(1, segElapsed() / segmentSeconds(seg, run.vdot)) : 0;
  const blocksKm = run.segs.slice(0, manual ? run.idx : run.segs.length).reduce((s, g) => s + segmentKm(g, run.vdot), 0) + partial;
  const kmDone = run.gpsOk && run.meters > 200 ? run.meters / 1000 : manual ? blocksKm : plannedKm;
  run.ctx.silentUpdate((s) => {
    s.pendingRun = { ...(s.pendingRun || {}), [run.id]: { km: Math.round(kmDone * 100) / 100, timeSec: Math.round(run.acc), gps: run.gpsOk } };
  });
  const id = run.id, ctx = run.ctx;
  run = null;
  ctx.replaceRoute('log', id);
}

function tick() {
  if (!run || run.paused) return;
  const seg = run.segs[run.idx];
  const t = segElapsed();
  if (segUsesDistance(seg)) {
    if (segDist() >= seg.km * 1000) return startSegment(run.idx + 1);
  } else {
    const total = segmentSeconds(seg, run.vdot);
    const left = Math.ceil(total - t);
    if (left <= 3 && left > 0 && run.lastCountdown !== left) { run.lastCountdown = left; beep(880, 120); }
    if (t >= total) return startSegment(run.idx + 1);
  }
  // km splits
  const k = Math.floor(run.meters / 1000);
  if (run.gpsOk && k > run.lastKm) {
    run.lastKm = k;
    speak(`Chilometro ${k}. Passo medio ${speakPaceSingle(elapsed() / (run.meters / 1000))}.`);
  }
  // pace coaching on run segments with GPS
  if (run.gpsOk && run.speed && seg.zone !== 'walk' && seg.kind !== 'recovery' && t > 45 && elapsed() - run.paceWarnAt > 60) {
    const cur = 1000 / run.speed;
    const [fast, slow] = zonePace(seg.zone, run.vdot);
    if (cur < fast - 10) { speak('Rallenta un po\'.'); run.paceWarnAt = elapsed(); }
    else if (cur > slow + 15 && !['E', 'L'].includes(seg.zone)) { speak('Puoi accelerare.'); run.paceWarnAt = elapsed(); }
  }
  paint();
}

function speakPaceSingle(s) {
  s = Math.round(s);
  return `${Math.floor(s / 60)} e ${s % 60}`;
}

function paint() {
  const root = document.querySelector('.run');
  if (!root || !run) return;
  const seg = run.segs[run.idx];
  const nxt = run.segs[run.idx + 1];
  const useD = segUsesDistance(seg);
  const total = useD ? seg.km * 1000 : segmentSeconds(seg, run.vdot);
  const done = useD ? segDist() : segElapsed();
  const left = Math.max(0, total - done);
  const $ = (sel) => root.querySelector(sel);
  $('.r-seg').textContent = `${seg.kind === 'run' ? ZONE_LABEL[seg.zone] : segmentTitle(seg)}${seg.reps && seg.kind === 'run' ? ` · ${seg.rep}/${seg.reps}` : ''}`;
  $('.r-target').textContent = seg.zone === 'walk' ? 'cammino' : paceRange(zonePace(seg.zone, run.vdot));
  $('.r-left').textContent = useD ? `${km(left / 1000)} km` : duration(left);
  $('.r-prog').style.width = `${Math.min(100, (done / total) * 100)}%`;
  $('.r-elapsed').textContent = duration(elapsed());
  $('.r-dist').textContent = run.gpsOn ? km(run.meters / 1000) : '–';
  $('.r-pace').textContent = run.gpsOn && run.speed ? pace(1000 / run.speed) : '–';
  $('.r-next').textContent = nxt ? `Poi: ${nxt.kind === 'run' ? ZONE_LABEL[nxt.zone] : segmentTitle(nxt)} ${nxt.km ? km(nxt.km) + ' km' : duration(nxt.sec)}` : 'Ultimo blocco';
  $('.r-step').textContent = `Blocco ${run.idx + 1} di ${run.segs.length}`;
  $('.r-gps').textContent = !run.gpsOn ? 'GPS spento: blocchi a tempo' : run.gpsOk ? (run.gpsAcc ? `GPS ±${Math.round(run.gpsAcc)} m` : 'GPS in attesa…') : `GPS non disponibile${run.gpsErr ? ': ' + run.gpsErr : ''}`;
  $('[data-act=pause]').textContent = run.paused ? 'Riprendi' : 'Pausa';
  root.className = `run z-${seg.zone} ${run.paused ? 'paused' : ''}`;
}

export function leaveRun() {
  if (!run) return;
  clearInterval(run.timer);
  run.gps?.stop();
  keepAwake(false);
  run = null;
}

export const runView = {
  html(ctx, id) {
    const found = findSession(ctx.state.plan, id);
    if (!found) return '<p>Allenamento non trovato.</p>';
    const { session: s, week } = found;
    if (!run || run.id !== id) {
      leaveRun();
      run = { id, ctx, vdot: week.vdot, segs: flatten(s.steps), idx: 0, acc: 0, meters: 0, lastKm: 0, gpsOn: true, paused: true, startedAt: null };
    }
    if (!run.startedAt) {
      return `
        <header class="bar-top"><button class="icon" data-act="back">‹</button><span>${esc(s.title)}</span><span></span></header>
        <div class="prerun">
          <ol class="seg-list">${run.segs.map((g) => `<li class="z-${g.zone}"><b>${g.kind === 'run' ? ZONE_LABEL[g.zone] : segmentTitle(g)}${g.reps && g.kind === 'run' ? ` ${g.rep}/${g.reps}` : ''}</b><span>${g.km ? km(g.km) + ' km' : duration(g.sec)}${g.zone !== 'walk' ? ' · ' + paceRange(zonePace(g.zone, run.vdot)) : ''}</span></li>`).join('')}</ol>
          <label class="check"><input type="checkbox" id="gps" ${run.gpsOn ? 'checked' : ''}/> Usa il GPS per distanza e ritmo</label>
          <p class="muted small">Tieni l'app aperta: lo schermo resta acceso e ricevi indicazioni vocali a ogni cambio di blocco. Senza GPS i blocchi in km sono convertiti in tempo al ritmo previsto.</p>
          <button class="btn primary block big" data-act="start">Via!</button>
        </div>`;
    }
    return `
      <div class="run">
        <div class="r-top"><span class="r-step"></span><span class="r-gps small"></span></div>
        <div class="r-seg"></div>
        <div class="r-target"></div>
        <div class="r-left"></div>
        <div class="progress"><i class="r-prog"></i></div>
        <div class="r-stats">
          <div><b class="r-elapsed"></b><small>tempo</small></div>
          <div><b class="r-dist"></b><small>km</small></div>
          <div><b class="r-pace"></b><small>ritmo /km</small></div>
        </div>
        <div class="r-next muted"></div>
        <div class="r-ctrl">
          <button class="btn" data-act="pause">Pausa</button>
          <button class="btn" data-act="skip">Salta ›</button>
          <button class="btn danger" data-act="stop">Termina</button>
        </div>
      </div>`;
  },
  bind(root, ctx, id) {
    if (!run) return;
    root.querySelector('[data-act=back]')?.addEventListener('click', () => { leaveRun(); ctx.back(); });
    root.querySelector('#gps')?.addEventListener('change', (e) => { run.gpsOn = e.target.checked; });
    root.querySelector('[data-act=start]')?.addEventListener('click', async () => {
      const r = run;
      speak('Si parte!'); // also unlocks audio on first user gesture
      beep(660, 50);
      if (r.gpsOn) {
        r.gps = new GpsTracker(({ meters, accuracy, speed }) => {
          if (!run || run !== r) return;
          r.meters = meters;
          r.gpsAcc = accuracy;
          r.speed = speed;
        });
        r.gpsOk = await r.gps.start();
        if (!r.gpsOk) r.gpsErr = r.gps.error;
      }
      if (run !== r) return;
      await keepAwake(true);
      r.startedAt = now();
      r.resumedAt = now();
      r.paused = false;
      r.timer = setInterval(tick, 250);
      ctx.render();
      startSegment(0);
      paint();
    });
    root.querySelector('[data-act=pause]')?.addEventListener('click', () => {
      if (run.paused) {
        run.resumedAt = now();
        run.paused = false;
        run.gps?.setPaused(false);
        speak('Si riparte.');
      } else {
        run.acc = elapsed();
        run.paused = true;
        run.gps?.setPaused(true);
        speak('In pausa.');
      }
      paint();
    });
    root.querySelector('[data-act=skip]')?.addEventListener('click', () => startSegment(run.idx + 1));
    root.querySelector('[data-act=stop]')?.addEventListener('click', () => {
      if (confirm('Terminare l\'allenamento?')) finish(true);
    });
    if (run.startedAt) paint();
  },
};
