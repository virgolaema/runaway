import { replan, HM_KM, mondayOf, maxVdotGain } from '../lib/plan.js';
import { predictRaceTime, vdotFromRace, trainingPaces } from '../lib/vdot.js';
import { km, duration, parseTime, paceRange, minutes } from '../lib/format.js';
import { ZONE_LABEL } from '../lib/workout.js';
import { today, currentWeek, doneKm, allSessions } from './common.js';

export const progressView = {
  html(ctx) {
    const { plan, logs } = ctx.state;
    const t = today();
    const cur = currentWeek(plan, t);
    const past = allSessions(plan).filter((s) => s.date <= t && s.type !== 'strength');
    const done = past.filter((s) => logs[s.id]?.done);
    const totalKm = Object.values(logs).reduce((s, l) => s + (l.done ? l.km || 0 : 0), 0);
    const totalTime = Object.values(logs).reduce((s, l) => s + (l.done ? l.timeSec || 0 : 0), 0);
    const weeks = plan.weeks.filter((w) => w.start <= t);
    const shown = plan.weeks.slice(0, Math.max(cur.index + 3, 6));
    const maxKm = Math.max(...shown.map((w) => Math.max(w.plannedKm, doneKm(w, logs))), 1);
    const vdot = cur.vdot;
    const paces = trainingPaces(vdot);
    const rpes = Object.values(logs).filter((l) => l.done && l.rpe);
    return `
      <header class="top"><h1>Progressi</h1></header>
      <div class="grid3">
        <div class="card soft"><b>${km(totalKm)}</b><small>km totali</small></div>
        <div class="card soft"><b>${minutes(totalTime)}</b><small>di corsa</small></div>
        <div class="card soft"><b>${past.length ? Math.round((done.length / past.length) * 100) : 0}%</b><small>completati</small></div>
      </div>

      <h3>Chilometri per settimana</h3>
      <div class="chart">
        ${shown.map((w) => {
          const d = doneKm(w, logs);
          return `<div class="col ${w.index === cur.index ? 'cur' : ''}">
            <div class="bars"><i class="plan" style="height:${(w.plannedKm / maxKm) * 100}%"></i><i class="done" style="height:${(d / maxKm) * 100}%"></i></div>
            <small>${w.index + 1}</small></div>`;
        }).join('')}
      </div>
      <div class="legend"><span><i class="plan"></i>pianificati</span><span><i class="done"></i>fatti</span></div>

      <h3>Previsione mezza</h3>
      <div class="card">
        <div class="big">${duration(predictRaceTime(vdot, HM_KM), { long: true })}</div>
        <div class="muted small">Ritmi attuali basati su VDOT ${vdot.toFixed(1)}${ctx.state.profile.raceTimeSec ? '' : ' (stima dal livello)'}${rpes.length ? ` · RPE medio ${(rpes.reduce((a, b) => a + b.rpe, 0) / rpes.length).toFixed(1)}` : ''}</div>
        <table class="paces">${['E', 'L', 'HM', 'T', 'I'].map((z) => `<tr><td>${ZONE_LABEL[z]}</td><td>${paceRange(paces[z])}</td></tr>`).join('')}</table>
        <a class="btn block" href="#/fitness">Aggiorna con un nuovo risultato</a>
      </div>

      <h3>Ricalibra</h3>
      <div class="card soft">
        <p class="muted small">Ricostruisce le settimane da oggi in poi partendo da quello che hai realmente registrato nelle ultime 4 settimane (volume e corsa più lunga), sempre rispettando le regole di progressione.</p>
        <button class="btn block" data-act="replan">Ricalibra il piano</button>
      </div>
      ${weeks.length ? '' : '<p class="muted small">Il piano non è ancora iniziato.</p>'}`;
  },
  bind(root, ctx) {
    root.querySelector('[data-act=replan]').addEventListener('click', () => {
      if (!confirm('Ricostruire il piano da oggi in base ai tuoi allenamenti registrati?')) return;
      try {
        const t = today();
        ctx.update((s) => {
          s.plan = replan(s.profile, s.plan, s.logs, t, 1);
          s.history.push({ date: t, event: 'Piano ricalibrato' });
        });
        ctx.go('plan');
      } catch (e) {
        alert(e.message);
      }
    });
  },
};

export const fitnessView = {
  html() {
    return `
      <header class="bar-top"><button class="icon" data-act="back">‹</button><span>Nuovo risultato</span><span></span></header>
      <p class="muted">Inserisci una gara o un test a tutta (es. 5 km da solo su percorso piatto). I ritmi di tutte le settimane future si aggiornano.</p>
      <form id="ff">
        <label class="field">Distanza
          <select name="d"><option value="5">5 km</option><option value="10">10 km</option><option value="${HM_KM}">Mezza maratona</option><option value="3">3 km</option></select></label>
        <label class="field">Tempo (mm:ss o h:mm:ss) <input name="t" type="text" inputmode="numeric" placeholder="25:30" required/></label>
        <div id="prev" class="muted small"></div>
        <button class="btn primary block" type="submit">Aggiorna ritmi</button>
      </form>`;
  },
  bind(root, ctx) {
    root.querySelector('[data-act=back]').addEventListener('click', () => ctx.back());
    const f = root.querySelector('#ff');
    const preview = () => {
      const d = Number(f.d.value), s = parseTime(f.t.value);
      root.querySelector('#prev').textContent = s ? `VDOT ${vdotFromRace(d, s).toFixed(1)} → mezza prevista ${duration(predictRaceTime(vdotFromRace(d, s), HM_KM), { long: true })}` : '';
    };
    f.addEventListener('input', preview);
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const d = Number(f.d.value), s = parseTime(f.t.value);
      if (!s) return;
      const v = vdotFromRace(d, s);
      const t = today();
      const thisMonday = mondayOf(t);
      ctx.silentUpdate((st) => {
        st.profile.raceDistanceKm = d;
        st.profile.raceTimeSec = s;
        const future = st.plan.weeks.filter((w) => w.start >= thisMonday);
        const goal = st.plan.assessment.goalVdot;
        const gain = maxVdotGain(st.plan.level, future.length);
        const end = goal ? Math.max(v, Math.min(goal, v + gain)) : v + gain / 2;
        future.forEach((w, i) => {
          const f2 = future.length > 1 ? i / (future.length - 1) : 1;
          w.vdot = +(v + (end - v) * f2).toFixed(2);
        });
        st.history.push({ date: t, event: `Nuovo risultato: ${km(d)} km in ${duration(s)} (VDOT ${v.toFixed(1)})` });
      });
      ctx.replaceRoute('progress');
    });
  },
};
