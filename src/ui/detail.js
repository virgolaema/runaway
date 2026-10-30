import { PHASE_LABEL } from '../lib/plan.js';
import { zonePace, hrRange, ZONE_LABEL, ZONE_RPE, estimateSeconds, segmentTitle, TYPE_LABEL } from '../lib/workout.js';
import { km, minutes, paceRange, esc, dateLong, parseTime, duration, pace } from '../lib/format.js';
import { findSession, status, today, typeIcon } from './common.js';

function secs(sec) {
  const m = Math.floor(sec / 60), r = sec % 60;
  return m ? `${m}'${r ? String(r).padStart(2, '0') + '"' : ''}` : `${r}"`;
}

function stepLine(step, vdot, age) {
  if (step.kind === 'repeat') {
    return `<li class="rep"><div class="rep-h">${step.reps} ×</div><ol>${step.steps.map((s) => stepLine(s, vdot, age)).join('')}</ol></li>`;
  }
  const amount = step.km ? `${km(step.km)} km` : secs(step.sec);
  const hr = hrRange(step.zone, age);
  return `
    <li class="z-${step.zone}">
      <div class="row between"><b>${amount} ${segmentTitle(step) && step.kind !== 'run' ? '· ' + segmentTitle(step) : ''}</b><span class="zone">${ZONE_LABEL[step.zone]}</span></div>
      <small class="muted">${step.zone === 'walk' ? 'cammino o corsa leggerissima' : `${paceRange(zonePace(step.zone, vdot))} · RPE ${ZONE_RPE[step.zone]}${hr ? ` · ${hr[0]}-${hr[1]} bpm` : ''}`}${step.note ? ' · ' + esc(step.note) : ''}</small>
    </li>`;
}

export const detailView = {
  html(ctx, id) {
    const { plan, logs, profile } = ctx.state;
    const found = findSession(plan, id);
    if (!found) return '<p>Allenamento non trovato.</p><a class="btn" href="#/today">Torna</a>';
    const { session: s, week } = found;
    const st = status(s, logs);
    const l = logs[s.id];
    const est = estimateSeconds(s, week.vdot);
    return `
      <header class="bar-top">
        <button class="icon" data-act="back" aria-label="Indietro">‹</button>
        <span class="muted small">Settimana ${week.index + 1} · ${PHASE_LABEL[week.phase]}</span>
        <span></span>
      </header>
      <div class="detail-head t-${s.type}">
        <span class="ico">${typeIcon(s.type)}</span>
        <div class="muted small">${dateLong(s.date)} · ${TYPE_LABEL[s.type]}</div>
        <h1>${esc(s.title)}</h1>
        <div class="stats">
          ${s.type !== 'strength' ? `<div><b>${km(s.km)}</b><small>km</small></div>` : ''}
          <div><b>${minutes(est)}</b><small>durata stimata</small></div>
        </div>
      </div>
      ${l?.done ? `
        <div class="card ok-card">
          <b>Completato</b>
          <div class="muted small">${l.km ? km(l.km) + ' km' : ''}${l.timeSec ? ' · ' + duration(l.timeSec) : ''}${l.km && l.timeSec ? ' · ' + pace(l.timeSec / l.km) + '/km' : ''}${l.rpe ? ' · RPE ' + l.rpe : ''}${l.pain ? ' · dolore segnalato' : ''}</div>
          ${l.notes ? `<p>${esc(l.notes)}</p>` : ''}
        </div>` : ''}
      <p class="notes">${esc(s.notes)}</p>
      ${s.type === 'strength' ? `
        <ol class="ex">${s.exercises.map(([n, r]) => `<li><b>${esc(n)}</b><span>${esc(r)}</span></li>`).join('')}</ol>
        <p class="muted small">Riscaldamento: 5' di mobilità (affondi dinamici, oscillazioni gambe, skip). Recupero 60-90" tra le serie.</p>` : `
        <h3>Struttura</h3>
        <ol class="steps-list">${s.steps.map((x) => stepLine(x, week.vdot, profile.age)).join('')}</ol>
        <p class="muted small">Ritmi calcolati sulla tua forma attuale (VDOT ${week.vdot.toFixed(1)}). Con caldo, vento o salite regola sullo sforzo (RPE), non sul ritmo.</p>`}
      <div class="actions">
        ${s.type !== 'strength' && st !== 'done' ? `<a class="btn primary block" href="#/run/${encodeURIComponent(s.id)}">▶ Inizia allenamento guidato</a>` : ''}
        <a class="btn block" href="#/log/${encodeURIComponent(s.id)}">${l?.done ? 'Modifica registrazione' : 'Registra manualmente'}</a>
        ${st !== 'done' && st !== 'skipped' ? '<button class="btn ghost block" data-act="skip">Salta questo allenamento</button>' : ''}
        ${st === 'skipped' || st === 'done' ? '<button class="btn ghost block" data-act="undo">Annulla stato</button>' : ''}
      </div>`;
  },
  bind(root, ctx, id) {
    root.querySelector('[data-act=back]')?.addEventListener('click', () => ctx.back());
    root.querySelector('[data-act=skip]')?.addEventListener('click', () => ctx.update((s) => {
      const f = findSession(s.plan, id);
      s.logs[id] = { skipped: true, date: f.session.date };
    }));
    root.querySelector('[data-act=undo]')?.addEventListener('click', () => ctx.update((s) => { delete s.logs[id]; }));
  },
};

export const logView = {
  html(ctx, id) {
    const { plan, logs } = ctx.state;
    const found = findSession(plan, id);
    if (!found) return '<p>Allenamento non trovato.</p>';
    const { session: s, week } = found;
    const l = logs[id] || ctx.state.pendingRun?.[id] || {};
    const isStrength = s.type === 'strength';
    const kmVal = l.km ?? (isStrength ? 0 : s.km);
    const timeVal = l.timeSec ? duration(l.timeSec) : isStrength ? '' : duration(estimateSeconds(s, week.vdot));
    return `
      <header class="bar-top">
        <button class="icon" data-act="back" aria-label="Indietro">‹</button>
        <span>Registra</span><span></span>
      </header>
      <h2>${esc(s.title)}</h2>
      <p class="muted small">${dateLong(s.date)}</p>
      <form id="logf">
        ${isStrength ? '' : `
        <label class="field">Distanza (km) <input name="km" type="number" step="0.01" min="0" inputmode="decimal" value="${kmVal}"/></label>
        <label class="field">Tempo (h:mm:ss o mm:ss) <input name="time" type="text" inputmode="numeric" value="${esc(timeVal)}"/></label>`}
        <label class="field">Fatica percepita (RPE) <output>${l.rpe || 5}/10</output>
          <input name="rpe" type="range" min="1" max="10" value="${l.rpe || 5}"/>
          <span class="rpe-scale"><small>1 riposo</small><small>4 facile</small><small>7 duro</small><small>10 massimo</small></span>
        </label>
        <label class="check"><input name="pain" type="checkbox" ${l.pain ? 'checked' : ''}/> Ho sentito dolore (non semplice fatica)</label>
        <label class="field">Note <textarea name="notes" rows="3" placeholder="Sensazioni, meteo, percorso…">${esc(l.notes || '')}</textarea></label>
        <button class="btn primary block" type="submit">Salva</button>
      </form>`;
  },
  bind(root, ctx, id) {
    root.querySelector('[data-act=back]')?.addEventListener('click', () => ctx.back());
    const f = root.querySelector('#logf');
    const rpe = f.querySelector('[name=rpe]');
    rpe.addEventListener('input', () => { rpe.parentElement.querySelector('output').textContent = `${rpe.value}/10`; });
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(f);
      const found = findSession(ctx.state.plan, id);
      const extra = ctx.state.pendingRun?.[id] || {};
      ctx.silentUpdate((s) => {
        s.logs[id] = {
          ...extra,
          done: true,
          date: found.session.date <= today() ? found.session.date : today(),
          km: Number(fd.get('km')) || 0,
          timeSec: parseTime(fd.get('time')) || null,
          rpe: Number(fd.get('rpe')),
          pain: fd.get('pain') === 'on',
          notes: String(fd.get('notes') || '').trim(),
        };
        if (s.pendingRun) delete s.pendingRun[id];
      });
      ctx.replaceRoute('w', id);
    });
  },
};
