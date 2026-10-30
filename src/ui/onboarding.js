import { generatePlan, goalAssessment, mondayOf, addDays, toISO, daysBetween, deriveLevel, HM_KM } from '../lib/plan.js';
import { duration, esc, dow, parseTime, DOW_LONG } from '../lib/format.js';

let draft = null;
let step = 0;

function freshDraft(prev) {
  const today = toISO(new Date());
  return prev
    ? { ...prev, startDate: prev.startDate < today ? today : prev.startDate, raceTime: prev.raceTimeSec ? duration(prev.raceTimeSec) : '', goalTime: prev.goalTimeSec ? duration(prev.goalTimeSec, { long: true }) : '' }
    : {
        level: null,
        canRun30: true,
        weeklyKm: 15,
        longestRunKm: 8,
        age: '',
        injury: false,
        raceDistanceKm: 0,
        raceTime: '',
        goalType: 'finish',
        goalTime: '',
        raceDate: addDays(mondayOf(today), 7 * 14 + 6),
        startDate: addDays(mondayOf(today), 7),
        runDays: [1, 3, 6],
        longRunDay: 6,
        strength: true,
      };
}

const STEPS = ['Esperienza', 'Carico attuale', 'Forma', 'Obiettivo', 'Calendario'];

function toProfile(d) {
  return {
    level: d.level,
    canRun30: d.level !== 'principiante' || d.canRun30,
    weeklyKm: Number(d.weeklyKm) || 0,
    longestRunKm: Number(d.longestRunKm) || 0,
    age: Number(d.age) || null,
    injury: !!d.injury,
    raceDistanceKm: Number(d.raceDistanceKm) || 0,
    raceTimeSec: Number(d.raceDistanceKm) ? parseTime(d.raceTime) : null,
    goalTimeSec: d.goalType === 'time' ? parseTime(d.goalTime) : null,
    raceDate: d.raceDate,
    startDate: d.startDate,
    runDays: [...d.runDays].sort((a, b) => a - b),
    longRunDay: d.runDays.includes(d.longRunDay) ? d.longRunDay : Math.max(...d.runDays),
    strength: d.strength,
  };
}

function weeksUntilRace(d) {
  return Math.floor(daysBetween(mondayOf(d.startDate), mondayOf(d.raceDate)) / 7) + 1;
}

function stepHtml(d) {
  switch (step) {
    case 0:
      return `
        <h2>Che runner sei?</h2>
        <p class="muted">Serve a scegliere volume e tipo di allenamenti. Nel dubbio scegli il livello più basso.</p>
        ${[
          ['principiante', 'Principiante', 'Corro da poco o in modo irregolare, meno di 15 km a settimana.'],
          ['intermedio', 'Intermedio', 'Corro con regolarità 3-4 volte a settimana, 15-35 km.'],
          ['avanzato', 'Avanzato', 'Corro 4+ volte a settimana, oltre 35 km, ho già fatto gare.'],
        ].map(([id, t, s]) => `
          <button class="choice ${d.level === id ? 'sel' : ''}" data-set="level" data-val="${id}">
            <strong>${t}</strong><span>${s}</span></button>`).join('')}
        ${d.level === 'principiante' ? `
          <label class="check"><input type="checkbox" data-bind="canRun30" ${d.canRun30 ? 'checked' : ''}/>
          Riesco a correre 30 minuti di fila senza fermarmi</label>` : ''}`;
    case 1:
      return `
        <h2>Il tuo carico attuale</h2>
        <p class="muted">Media delle ultime 4 settimane. Il piano parte da qui: aumenti troppo rapidi sono la prima causa di infortunio.</p>
        <label class="field">Km a settimana <output>${d.weeklyKm} km</output>
          <input type="range" min="0" max="80" step="1" value="${d.weeklyKm}" data-bind="weeklyKm" data-out/></label>
        <label class="field">Corsa più lunga negli ultimi 30 giorni <output>${d.longestRunKm} km</output>
          <input type="range" min="0" max="25" step="0.5" value="${d.longestRunKm}" data-bind="longestRunKm" data-out/></label>
        <label class="field">Età <input type="number" inputmode="numeric" min="14" max="90" placeholder="es. 35" value="${esc(d.age)}" data-bind="age"/></label>
        <label class="check"><input type="checkbox" data-bind="injury" ${d.injury ? 'checked' : ''}/> Ho avuto un infortunio da corsa negli ultimi 3 mesi</label>`;
    case 2:
      return `
        <h2>Un risultato recente</h2>
        <p class="muted">Gara o test a tutta degli ultimi 2 mesi. Serve a calcolare i tuoi ritmi (metodo VDOT di Daniels). Se non ne hai, stimiamo dal livello e potrai aggiornare dopo.</p>
        <div class="seg">
          ${[[0, 'Nessuno'], [5, '5 km'], [10, '10 km'], [HM_KM, 'Mezza']].map(([v, l]) => `
            <button class="${Number(d.raceDistanceKm) === v ? 'sel' : ''}" data-set="raceDistanceKm" data-val="${v}">${l}</button>`).join('')}
        </div>
        ${Number(d.raceDistanceKm) ? `
          <label class="field">Tempo (${Number(d.raceDistanceKm) > 15 ? 'h:mm:ss' : 'mm:ss'})
            <input type="text" inputmode="numeric" placeholder="${Number(d.raceDistanceKm) > 15 ? '1:58:00' : '27:30'}" value="${esc(d.raceTime)}" data-bind="raceTime"/></label>` : ''}`;
    case 3: {
      const p = toProfile(d);
      const weeks = weeksUntilRace(d);
      const a = goalAssessment({ ...p, goalTimeSec: null }, Math.max(4, weeks));
      const ga = p.goalTimeSec ? goalAssessment(p, Math.max(4, weeks)) : null;
      return `
        <h2>Il tuo obiettivo</h2>
        <div class="seg">
          <button class="${d.goalType === 'finish' ? 'sel' : ''}" data-set="goalType" data-val="finish">Finire bene</button>
          <button class="${d.goalType === 'time' ? 'sel' : ''}" data-set="goalType" data-val="time">Tempo obiettivo</button>
        </div>
        <div class="card soft">
          <div class="muted small">Stima oggi${p.raceTimeSec ? '' : ' (dal livello)'}</div>
          <div class="big">${duration(a.predictedNow, { long: true })}</div>
          <div class="muted small">Possibile a fine piano (~${weeks} sett.): circa ${duration(a.predictedEnd, { long: true })}</div>
        </div>
        ${d.goalType === 'time' ? `
          <label class="field">Tempo obiettivo (h:mm:ss)
            <input type="text" inputmode="numeric" placeholder="1:59:00" value="${esc(d.goalTime)}" data-bind="goalTime"/></label>
          ${ga ? (ga.feasible
            ? '<p class="ok">Obiettivo realistico per il tempo a disposizione.</p>'
            : `<p class="warn">Obiettivo molto ambizioso: richiederebbe un miglioramento più rapido di quanto si osserva di solito. I ritmi saranno impostati su un obiettivo intermedio (${duration(goalAssessment({ ...p, goalTimeSec: null }, weeks).predictedEnd, { long: true })} circa); potrai aggiornarli se migliori più del previsto.</p>`) : ''}` : ''}`;
    }
    case 4: {
      const weeks = weeksUntilRace(d);
      return `
        <h2>Calendario</h2>
        <label class="field">Data della gara <input type="date" value="${d.raceDate}" data-bind="raceDate"/></label>
        <label class="field">Inizio piano <input type="date" value="${d.startDate}" data-bind="startDate"/></label>
        <p class="${weeks < 8 || weeks > 24 ? 'warn' : 'muted'} small">${weeks} settimane. ${weeks < 8 ? 'Poche: il piano sarà compresso.' : weeks > 24 ? 'Molte: considera di iniziare più tardi (ideale 12-20).' : 'Ideale tra 12 e 20.'}</p>
        <div class="field">Giorni di corsa (${d.runDays.length})
          <div class="days">${[0, 1, 2, 3, 4, 5, 6].map((i) => `
            <button class="${d.runDays.includes(i) ? 'sel' : ''}" data-day="${i}">${dow(i)}</button>`).join('')}</div>
          <span class="${d.runDays.length < 3 || d.runDays.length > 6 ? 'warn' : 'muted'} small">Da 3 a 6 giorni (consigliati 3-5): almeno un giorno di riposo a settimana.</span>
        </div>
        <label class="field">Giorno del lungo
          <select data-bind="longRunDay">${d.runDays.map((i) => `<option value="${i}" ${d.longRunDay === i ? 'selected' : ''}>${DOW_LONG[i]}</option>`).join('')}</select></label>
        <label class="check"><input type="checkbox" data-bind="strength" ${d.strength ? 'checked' : ''}/> Includi 2 sedute di forza a settimana (consigliato)</label>`;
    }
  }
  return '';
}

function canAdvance(d) {
  if (step === 0) return !!d.level;
  if (step === 2) return !Number(d.raceDistanceKm) || !!parseTime(d.raceTime);
  if (step === 3) return d.goalType === 'finish' || !!parseTime(d.goalTime);
  if (step === 4) {
    const w = weeksUntilRace(d);
    return d.runDays.length >= 3 && d.runDays.length <= 6 && w >= 4 && w <= 30;
  }
  return true;
}

export const onboardingView = {
  html(ctx) {
    if (!draft) {
      draft = freshDraft(ctx.state.profile);
      step = 0;
    }
    const d = draft;
    return `
      <div class="onb">
        <header class="onb-head">
          ${step > 0 ? '<button class="icon" data-act="prev" aria-label="Indietro">‹</button>' : (ctx.state.plan ? '<button class="icon" data-act="cancel" aria-label="Annulla">×</button>' : '<span></span>')}
          <div class="steps">${STEPS.map((s, i) => `<i class="${i <= step ? 'on' : ''}"></i>`).join('')}</div>
          <span class="muted small">${step + 1}/${STEPS.length}</span>
        </header>
        ${step === 0 && !ctx.state.plan ? `<div class="hero"><h1>Runaway</h1><p>Il tuo piano per la mezza maratona, costruito sulle evidenze scientifiche più recenti e adattato a come rispondi.</p></div>` : ''}
        <section class="onb-body">${stepHtml(d)}</section>
        <div id="err" class="warn small"></div>
        <footer class="onb-foot">
          <button class="btn primary block" data-act="next" ${canAdvance(d) ? '' : 'disabled'}>${step === STEPS.length - 1 ? 'Crea il mio piano' : 'Avanti'}</button>
          ${step === 0 ? '<a class="link small" href="#/science">Come funziona il piano?</a>' : ''}
        </footer>
      </div>`;
  },
  bind(root, ctx) {
    const d = draft;
    const refresh = () => ctx.render();
    root.querySelectorAll('[data-set]').forEach((el) => el.addEventListener('click', () => {
      const v = el.dataset.val;
      d[el.dataset.set] = isNaN(Number(v)) ? v : Number(v);
      if (el.dataset.set === 'level' && v === 'principiante' && d.weeklyKm > 20) d.weeklyKm = 10;
      refresh();
    }));
    root.querySelectorAll('[data-bind]').forEach((el) => {
      const k = el.dataset.bind;
      const ev = el.type === 'checkbox' || el.tagName === 'SELECT' || el.type === 'date' ? 'change' : 'input';
      el.addEventListener(ev, () => {
        d[k] = el.type === 'checkbox' ? el.checked : el.tagName === 'SELECT' ? Number(el.value) : el.value;
        if (el.dataset.out !== undefined) el.parentElement.querySelector('output').textContent = `${el.value} km`;
        const btn = root.querySelector('[data-act=next]');
        btn.disabled = !canAdvance(d);
        if (ev === 'change' && el.type !== 'checkbox') refresh();
      });
      if (ev === 'input' && el.type === 'text') el.addEventListener('change', refresh);
    });
    root.querySelectorAll('[data-day]').forEach((el) => el.addEventListener('click', () => {
      const i = Number(el.dataset.day);
      d.runDays = d.runDays.includes(i) ? d.runDays.filter((x) => x !== i) : [...d.runDays, i].sort();
      if (!d.runDays.includes(d.longRunDay) && d.runDays.length) d.longRunDay = d.runDays.includes(6) ? 6 : d.runDays[d.runDays.length - 1];
      refresh();
    }));
    root.querySelector('[data-act=prev]')?.addEventListener('click', () => { step--; refresh(); });
    root.querySelector('[data-act=cancel]')?.addEventListener('click', () => { draft = null; ctx.go('profile'); });
    root.querySelector('[data-act=next]').addEventListener('click', () => {
      if (!canAdvance(d)) return;
      if (step < STEPS.length - 1) { step++; refresh(); return; }
      try {
        const profile = toProfile(d);
        profile.level = profile.level || deriveLevel(profile);
        const plan = generatePlan({ ...profile, today: toISO(new Date()) });
        draft = null;
        step = 0;
        ctx.update((s) => {
          s.profile = profile;
          s.plan = plan;
          s.logs = s.logs || {};
          s.history = [...(s.history || []), { date: toISO(new Date()), event: 'Piano creato' }];
        });
        ctx.replaceRoute('today');
      } catch (e) {
        root.querySelector('#err').textContent = e.message;
      }
    });
  },
};

export function restartOnboarding() {
  draft = null;
  step = 0;
}
