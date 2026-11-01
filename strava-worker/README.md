# Collegare Garmin a Runaway su iPhone (via Strava)

Percorso dei dati: **orologio Garmin → Garmin Connect → Strava → Runaway**.
Il piccolo server (Cloudflare Worker, gratuito) serve solo a custodire la chiave segreta di Strava: non salva nulla.

Tempo richiesto: circa 10 minuti, una volta sola. Si fa anche da telefono, ma da computer è più comodo.

## 1. Garmin → Strava

App **Garmin Connect** → Altro → Impostazioni → **App collegate** (o "App di terze parti") → **Strava** → collega.
Da qui in poi ogni corsa dell'orologio finisce su Strava in automatico.

## 2. Crea l'app API su Strava

1. Vai su <https://www.strava.com/settings/api> (con il tuo account Strava).
2. Compila:
   - **Application Name**: `Runaway`
   - **Category**: Training
   - **Website**: `https://virgolaema.github.io/runaway/`
   - **Authorization Callback Domain**: `virgolaema.github.io`
3. Se chiede un'icona, usa [icon-512.png](https://raw.githubusercontent.com/virgolaema/runaway/main/public/icon-512.png).
4. Annota **Client ID** e **Client Secret**.

## 3. Crea il server su Cloudflare

1. Registrati gratis su <https://dash.cloudflare.com/sign-up>.
2. **Workers & Pages** → **Create** → **Create Worker** (modello "Hello World") → nome `runaway-strava` → **Deploy**.
3. **Edit code**: cancella tutto e incolla il contenuto di [worker.js](https://raw.githubusercontent.com/virgolaema/runaway/main/strava-worker/worker.js) → **Deploy**.
4. Torna al Worker → **Settings** → **Variables and Secrets** → **Add**:
   - `STRAVA_CLIENT_ID` → tipo *Text* → il Client ID di Strava
   - `STRAVA_CLIENT_SECRET` → tipo *Secret* → il Client Secret di Strava
   
   e salva con **Deploy**.
5. Copia l'indirizzo del Worker, tipo `https://runaway-strava.<tuo-nome>.workers.dev`.

Verifica: aprendo `https://runaway-strava.<tuo-nome>.workers.dev/config` devi vedere `{"client_id":"…"}`.

## 4. Collega Runaway

Runaway (dalla schermata Home) → **Profilo** → **Orologio** → incolla l'indirizzo del Worker → **Collega Strava** → **Autorizza**.

Se dopo l'autorizzazione la pagina si apre in Safari invece che nell'app, ti mostra un **codice di collegamento**: copialo, apri Runaway dalla schermata Home e incollalo in Profilo → Orologio → "Ho un codice di collegamento".

Da quel momento Runaway importa le corse da Strava a ogni apertura (ultimi 30 giorni), le associa all'allenamento del giorno (±1 giorno) con distanza, tempo e FC media, e ti chiede solo la fatica percepita.

## Note

- Le app API nuove di Strava possono collegare un solo atleta, il proprietario: per uso personale va benissimo.
- Il codice di collegamento e i token restano solo sul telefono. Per revocare l'accesso: <https://www.strava.com/settings/apps>.
- Chi usa la versione Android non ha bisogno di tutto questo: lì Runaway legge le corse direttamente da Health Connect.
