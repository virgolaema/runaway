import { PHASE_LABEL } from '../lib/plan.js';
import { km, dateShort, duration } from '../lib/format.js';
import { predictRaceTime } from '../lib/vdot.js';
import { today, currentWeek, sessionRow, doneKm } from './common.js';

let open = null;

export const planView = {
  keepScroll: false,
  html(ctx) {
    const { plan, logs } = ctx.state;
    const cur = currentWeek(plan, today());
    if (open === null) open = cur.index;
    const maxKm = Math.max(...plan.weeks.map((w) => w.plannedKm));
    let lastPhase = null;
    return `
      <header class="top"><h1>Il tuo piano</h1></header>
      <div class="card soft">
        <div class="row between">
          <div><small class="muted">Gara</small><div><b>${dateShort(plan.raceDate)}</b></div></div>
          <div><small class="muted">Settimane</small><div><b>${plan.totalWeeks}</b></div></div>
          <div><small class="muted">Picco</small><div><b>${km(maxKm)} km</b></div></div>
          <div><small class="muted">Obiettivo ritmi</small><div><b>${duration(predictRaceTime(plan.weeks[plan.weeks.length - 1].vdot, 21.0975), { long: true })}</b></div></div>
        </div>
      </div>
      ${plan.warnings.length ? `<div class="card note">${plan.warnings.map((w) => `<p>${w}</p>`).join('')}</div>` : ''}
      <div class="volume">
        ${plan.weeks.map((w) => `<i class="ph-${w.phase} ${w.index === cur.index ? 'cur' : ''}" style="height:${(w.plannedKm / maxKm) * 100}%" title="S${w.index + 1}"></i>`).join('')}
      </div>
      <div class="legend">${Object.entries(PHASE_LABEL).map(([k, v]) => `<span><i class="ph-${k}"></i>${v}</span>`).join('')}</div>
      ${plan.weeks.map((w) => {
        const head = w.phase !== lastPhase ? `<h3 class="phase-h">${PHASE_LABEL[w.phase]}</h3>` : '';
        lastPhase = w.phase;
        const done = doneKm(w, logs);
        return `${head}
          <div class="week ${w.index === cur.index ? 'cur' : ''} ${open === w.index ? 'open' : ''}">
            <button class="week-h" data-week="${w.index}">
              <span><b>Settimana ${w.index + 1}</b>${w.down && w.phase !== 'taper' ? ' <span class="pill sm">scarico</span>' : ''}<br><small class="muted">dal ${dateShort(w.start)}</small></span>
              <span class="right"><b>${km(w.plannedKm)} km</b><br><small class="muted">${done ? `${km(done)} fatti` : `${w.sessions.filter((s) => s.type !== 'strength').length} corse`}</small></span>
            </button>
            ${open === w.index ? `<div class="list">${w.sessions.map((s) => sessionRow(s, w, logs)).join('')}</div>` : ''}
          </div>`;
      }).join('')}`;
  },
  bind(root, ctx) {
    root.querySelectorAll('[data-week]').forEach((el) => el.addEventListener('click', () => {
      const i = Number(el.dataset.week);
      open = open === i ? -1 : i;
      const y = window.scrollY;
      ctx.render();
      window.scrollTo(0, y);
    }));
  },
};
