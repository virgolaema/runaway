# Runaway

App Android per preparare una mezza maratona: crea un piano personalizzato, guida gli allenamenti con indicazioni vocali e GPS e si adatta a come stai rispondendo.

## Scaricare l'app

Ultima versione: [Releases](https://github.com/virgolaema/runaway/releases/latest) → scarica `Runaway-x.y.z.apk` sul telefono e aprilo. Android chiede di consentire l'installazione da origini sconosciute. Le versioni successive si installano sopra la precedente mantenendo i dati.

## Orologio (Garmin)

Le corse registrate con l'orologio arrivano in Runaway tramite **Health Connect**: in Garmin Connect attiva Impostazioni → Health Connect, poi in Runaway Profilo → Orologio → Collega. Ogni corsa viene associata all'allenamento del giorno (±1 giorno) con distanza, tempo e FC media; quelle non previste contano come corse extra. Funziona con qualsiasi app che scrive le corse in Health Connect (Polar, Coros, Samsung, Pixel Watch…).

## Come costruisce il piano

- **Lungo**: nessuna corsa supera del 10% la più lunga dei 30 giorni precedenti (Frandsen et al., BJSM 2025).
- **Volume**: +10% a settimana al massimo, settimana di scarico ogni 4 (ogni 3 dai 50 anni).
- **Intensità**: circa 80% facile; soglia ≤ ~10% e ripetute ≤ ~8% del volume (Seiler 2010; Daniels).
- **Ritmi**: modello VDOT di Daniels da un risultato recente, aggiornabile durante il piano.
- **Fasi**: base → sviluppo → specifica → scarico di 2 settimane (-30% / -55%, intensità mantenuta; Bosquet 2007).
- **Forza**: 2 sedute a settimana (Lauersen 2014; Blagrove 2018).
- **Adattamento**: dolore segnalato, allenamenti saltati o corse facili troppo faticose → il piano si ricostruisce dal carico reale registrato.

Riferimenti completi nella schermata *Profilo → La scienza dietro il piano*.

## Sviluppo

```bash
npm install
npm run dev        # app nel browser
npm test           # test del generatore di piani
npm run cap:sync   # build web + copia nel progetto Android
```

L'APK viene compilato da GitHub Actions (`.github/workflows/android.yml`) a ogni push su `main` e pubblicato come Release. Il keystore in `android/app/` è un keystore di debug, usato solo per poter aggiornare l'app sopra la versione precedente; per il Play Store serve un keystore di release privato.

Stack: JavaScript + Vite, Capacitor 8 (geolocalizzazione, sintesi vocale, vibrazione).
