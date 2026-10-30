import { HM_KM } from '../lib/plan.js';
import { duration, km, esc, dateShort, DOW_LONG, dow } from '../lib/format.js';
import { hrMax, hrRange, ZONE_LABEL } from '../lib/workout.js';
import { restartOnboarding } from './onboarding.js';

const LEVEL_LABEL = { principiante: 'Principiante', intermedio: 'Intermedio', avanzato: 'Avanzato' };

export const profileView = {
  html(ctx) {
    const { profile: p, plan, history } = ctx.state;
    const m = hrMax(p.age);
    return `
      <header class="top"><h1>Profilo</h1></header>
      <div class="card">
        <table class="kv">
          <tr><td>Livello</td><td>${LEVEL_LABEL[plan.level]}</td></tr>
          <tr><td>Partenza</td><td>${km(p.weeklyKm)} km/sett · lungo ${km(p.longestRunKm)} km</td></tr>
          <tr><td>Risultato di riferimento</td><td>${p.raceTimeSec ? `${p.raceDistanceKm === HM_KM ? 'Mezza' : km(p.raceDistanceKm) + ' km'} in ${duration(p.raceTimeSec)}` : 'nessuno (stima)'}</td></tr>
          <tr><td>Obiettivo</td><td>${p.goalTimeSec ? duration(p.goalTimeSec, { long: true }) : 'Finire bene'}</td></tr>
          <tr><td>Gara</td><td>${dateShort(p.raceDate)}</td></tr>
          <tr><td>Giorni di corsa</td><td>${p.runDays.map(dow).join(', ')} · lungo ${DOW_LONG[p.longRunDay].toLowerCase()}</td></tr>
          ${p.age ? `<tr><td>Età</td><td>${p.age}</td></tr>` : ''}
        </table>
        <button class="btn block" data-act="edit">Modifica e rigenera il piano</button>
      </div>

      ${m ? `
        <h3>Zone di frequenza cardiaca</h3>
        <div class="card soft">
          <p class="muted small">FC max stimata ${m} bpm (formula di Tanaka: 208 − 0,7 × età). È una stima con errore di ±10 bpm: se conosci la tua FC max reale, fidati di quella e soprattutto della sensazione di sforzo.</p>
          <table class="paces">${['E', 'HM', 'T', 'I'].map((z) => { const r = hrRange(z, p.age); return `<tr><td>${ZONE_LABEL[z]}</td><td>${r[0]}–${r[1]} bpm</td></tr>`; }).join('')}</table>
        </div>` : ''}

      <h3>Storico</h3>
      <div class="card soft">${(history || []).slice(-8).reverse().map((h) => `<div class="row between small"><span>${esc(h.event)}</span><span class="muted">${dateShort(h.date)}</span></div>`).join('') || '<span class="muted small">—</span>'}</div>

      <a class="btn block" href="#/science">La scienza dietro il piano</a>
      <button class="btn ghost block danger-text" data-act="reset">Cancella tutti i dati</button>
      <p class="muted small center">Runaway non sostituisce il parere medico. In caso di dolore che persiste, fermati e consulta un professionista.</p>`;
  },
  bind(root, ctx) {
    root.querySelector('[data-act=edit]').addEventListener('click', () => {
      if (!confirm('Il piano verrà rigenerato con i nuovi dati. Gli allenamenti già registrati restano nello storico. Continuare?')) return;
      restartOnboarding();
      ctx.go('onboarding');
    });
    root.querySelector('[data-act=reset]').addEventListener('click', () => {
      if (confirm('Cancellare profilo, piano e allenamenti registrati?')) ctx.reset();
    });
  },
};

const REFS = [
  ['Progressione del lungo', 'Nessuna corsa supera del 10% la più lunga dei 30 giorni precedenti. In 5.200 runner seguiti 18 mesi, i “picchi” di distanza in una singola uscita erano associati a più infortuni, mentre il rapporto carico acuto/cronico e la variazione settimanale non lo erano.', 'Frandsen JSB et al., Br J Sports Med 2025'],
  ['Volume settimanale', 'Aumento graduale (~10% a settimana) con una settimana di scarico ogni 4 (ogni 3 dai 50 anni). Incrementi rapidi del volume settimanale aumentano il rischio di alcuni infortuni nei principianti.', 'Nielsen RO et al., JOSPT 2014; Damsted C et al., IJSPT 2018'],
  ['Intensità: 80/20', 'Circa l’80% del tempo di corsa a bassa intensità, il resto a soglia e sopra. Distribuzione polarizzata e piramidale danno risultati simili: conta che la maggior parte del lavoro sia facile.', 'Seiler S, IJSPP 2010; Stöggl & Sperlich, Front Physiol 2014; Rosenblat MA et al., JSCR 2019; Oliveira PS et al., Sports Med 2024'],
  ['Ritmi personalizzati', 'Ritmi calcolati con il modello VDOT di Daniels a partire da un risultato recente. Soglia ≤ ~10% e ripetute ≤ ~8% del volume settimanale.', 'Daniels J, Daniels’ Running Formula, 4a ed. 2022'],
  ['Scarico pre-gara', 'Ultime 2 settimane: volume ridotto del 30% e poi del 55% circa, mantenendo intensità e frequenza. È la strategia con il miglior effetto sulla prestazione.', 'Bosquet L et al., Med Sci Sports Exerc 2007; Wang Z et al., PLoS One 2023'],
  ['Forza', 'Due sedute a settimana di forza riducono gli infortuni da sport e migliorano l’economia di corsa.', 'Lauersen JB et al., Br J Sports Med 2014; Blagrove RC et al., Sports Med 2018'],
  ['Alimentazione in gara', 'Per sforzi di 1-2,5 ore, 30-60 g di carboidrati all’ora migliorano la prestazione.', 'Thomas DT, Erdman KA, Burke LM, Med Sci Sports Exerc 2016'],
  ['Frequenza cardiaca', 'FC max stimata come 208 − 0,7 × età.', 'Tanaka H et al., J Am Coll Cardiol 2001'],
  ['Adattamento', 'Se segnali dolore, salti più allenamenti o le corse facili diventano faticose, il piano si alleggerisce e riparte dal carico reale, invece di farti “recuperare” i km persi.', 'Principio di progressione basato sul carico reale'],
];

export const scienceView = {
  html() {
    return `
      <header class="bar-top"><button class="icon" data-act="back">‹</button><span>La scienza</span><span></span></header>
      <p class="muted">Come Runaway costruisce il tuo piano, e su quali studi si basa.</p>
      ${REFS.map(([t, d, r]) => `<div class="card soft ref"><b>${t}</b><p>${d}</p><small class="muted">${r}</small></div>`).join('')}`;
  },
  bind(root, ctx) {
    root.querySelector('[data-act=back]').addEventListener('click', () => (history.length > 1 ? ctx.back() : ctx.go('today')));
  },
};
