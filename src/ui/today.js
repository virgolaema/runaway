import { adaptationSignal, replan, daysBetween, PHASE_LABEL, mondayOf } from '../lib/plan.js';
import { estimateSeconds, TYPE_LABEL } from '../lib/workout.js';
import { km, minutes, esc, dateLong, dow } from '../lib/format.js';
import { today, currentWeek, status, sessionRow, doneKm, allSessions, typeIcon } from './common.js';

export const todayView = {
  html(ctx) {
    const { plan, logs } = ctx.state;
    const t = today();
    const week = currentWeek(plan, t);
    const toRace = daysBetween(t, plan.raceDate);
    const sessions = allSessions(plan);
    const todays = sessions.filter((s) => s.date === t);
    const next = sessions.find((s) => s.date > t && s.type !== 'strength');
    const signal = adaptationSignal(plan, logs, t);
    const dismissed = ctx.state.dismissedSignal === mondayOf(t);
    const done = doneKm(week, logs);

    const hero = (s, label) => {
      const st = status(s, logs, t);
      return `
        <a class="hero-card t-${s.type}" href="#/w/${encodeURIComponent(s.id)}">
          <div class="row between"><span class="pill">${label}</span><span class="ico">${typeIcon(s.type)}</span></div>
          <h2>${esc(s.title)}</h2>
          <div class="stats">
            ${s.type !== 'strength' ? `<div><b>${km(s.km)}</b><small>km</small></div>` : ''}
            <div><b>${minutes(estimateSeconds(s, s.week.vdot))}</b><small>durata</small></div>
            <div><b>${TYPE_LABEL[s.type]}</b><small>tipo</small></div>
          </div>
          ${st === 'done' ? '<div class="ok">Completato ✓</div>' : st === 'skipped' ? '<div class="muted">Saltato</div>' : '<div class="cta">Vedi allenamento ›</div>'}
        </a>`;
    };

    return `
      <header class="top">
        <div>
          <div class="muted small">${dateLong(t)}</div>
          <h1>${toRace > 0 ? `${toRace} giorni alla mezza` : toRace === 0 ? 'Oggi è il giorno!' : 'Gara completata'}</h1>
        </div>
      </header>
      <div class="muted">Settimana ${week.index + 1} di ${plan.totalWeeks} · ${PHASE_LABEL[week.phase]}${week.down ? ' · scarico' : ''}</div>

      ${signal && !dismissed ? `
        <div class="card alert">
          <b>${esc(signal.reason)}</b>
          <p>${esc(signal.advice)}</p>
          <div class="row gap">
            <button class="btn primary" data-act="adapt">Adatta il piano</button>
            <button class="btn ghost" data-act="dismiss">Ignora</button>
          </div>
        </div>` : ''}

      ${todays.length ? todays.map((s) => hero({ ...s, week }, s.type === 'strength' ? 'Oggi · Forza' : 'Oggi')).join('') : `
        <div class="card soft rest">
          <h2>Riposo</h2>
          <p class="muted">Il recupero è parte dell'allenamento: è qui che il corpo si adatta.</p>
        </div>
        ${next ? hero(next, `Prossimo · ${dow(next.day)}`) : ''}`}

      <section>
        <div class="row between"><h3>Questa settimana</h3><span class="muted small">${km(done)} / ${km(week.plannedKm)} km</span></div>
        <div class="bar"><i style="width:${Math.min(100, (done / (week.plannedKm || 1)) * 100)}%"></i></div>
        <div class="week-strip">
          ${[0, 1, 2, 3, 4, 5, 6].map((d) => {
            const ss = week.sessions.filter((s) => s.day === d);
            const run = ss.find((s) => s.type !== 'strength');
            const st = run ? status(run, logs, t) : null;
            return `<div class="day ${d === (new Date().getDay() + 6) % 7 && week.start <= t ? 'now' : ''}">
              <small>${dow(d)}</small>
              <span class="dot ${run ? 't-' + run.type : ''} ${st ? 'st-' + st : ''}">${run ? km(run.km) : ss.length ? 'F' : ''}</span>
            </div>`;
          }).join('')}
        </div>
        <div class="list">${week.sessions.map((s) => sessionRow(s, week, logs)).join('')}</div>
      </section>`;
  },
  bind(root, ctx) {
    root.querySelector('[data-act=dismiss]')?.addEventListener('click', () => ctx.update((s) => { s.dismissedSignal = mondayOf(today()); }));
    root.querySelector('[data-act=adapt]')?.addEventListener('click', () => {
      const t = today();
      const sig = adaptationSignal(ctx.state.plan, ctx.state.logs, t);
      try {
        ctx.update((s) => {
          s.plan = replan(s.profile, s.plan, s.logs, t, sig?.factor ?? 1);
          s.dismissedSignal = mondayOf(t);
          s.history.push({ date: t, event: `Piano adattato: ${sig?.reason ?? ''}` });
        });
      } catch (e) {
        alert(e.message);
      }
    });
  },
};
