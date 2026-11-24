# visiteSmart

Pianificazione delle visite di autorizzazione (AU) e accreditamento (AC) alle sedi: composizione del team con i vincoli (distanza dalla ULSS, conflitto di interesse, 3 ore tra due visite), calendario settimanale, visite congiunte AU+AC, conferma ed eliminazione delle visite, carico di lavoro di team leader e valutatori.

- **Frontend:** React 19 + TypeScript + Vite (`src/`)
- **Backend:** FastAPI in Docker (`backend/`)
- **Database:** SQLite nel volume Docker `visite_data`, creato dal dump `db/visite.sql`

## Quickstart

### 1. Prerequisiti

- [Docker Desktop](https://www.docker.com/products/docker-desktop/), con Docker Compose v2
- [Node.js](https://nodejs.org/) 22.12 o successivo, con npm
- Git

### 2. Scarica il repository

```bash
git clone https://github.com/LaifeReply/visiteSmart.git
cd visiteSmart
```

### 3. Avvia tutto

**Windows (PowerShell):**

```powershell
.\start.ps1
```

Lo script:
1. avvia Docker Desktop se è spento;
2. costruisce il backend e crea il database dal dump `db/visite.sql` (solo al primo avvio);
3. aspetta che il backend risponda;
4. installa le dipendenze npm se mancano e avvia il frontend.

Se Windows blocca l'esecuzione degli script: `powershell -ExecutionPolicy Bypass -File .\start.ps1`

**macOS / Linux, o a mano:**

```bash
docker compose up -d --build   # backend + database
npm install                    # solo la prima volta
npm run dev                    # frontend
```

### 4. Apri l'app

- App: http://localhost:5173
- API: http://localhost:8000/visite (documentazione interattiva su http://localhost:8000/docs)

Si parte dal pannello **"Componi il team"**: scegli team leader e valutatori, premi **Conferma** e nel calendario usa **"Crea nuova visita"**.

## Comandi utili

| Cosa | Comando |
|---|---|
| Avvio senza ricostruire il backend | `.\start.ps1 -NoBuild` |
| Fermare il frontend | `Ctrl+C` nel terminale di `npm run dev` |
| Fermare il backend (i dati restano) | `docker compose down` |
| Log del backend | `docker compose logs -f api` |
| Controlli automatici | `npx tsc -b` e `node src/lib/<nome>.check.ts` |
| Aggiornare il dump dopo modifiche ai dati | `docker compose run --rm -T --entrypoint sqlite3 db-seed /data/visite.db .dump > db/visite.sql` |

## Database

- Il database è il file `/data/visite.db` nel volume Docker `visite_data`.
- Al primo avvio il servizio `db-seed` lo crea dal dump `db/visite.sql`. Se il file esiste già non lo tocca, quindi i dati non vengono mai sovrascritti.
- Per ripartire dai dati del dump: `docker compose down -v`, poi di nuovo `docker compose up -d`.
  **Attenzione:** `-v` cancella il volume, cioè il database attuale e tutto quello che contiene.

## Struttura

```
backend/            API FastAPI (main.py) e Dockerfile
db/visite.sql       dump del database usato per il primo avvio
src/components/     componenti React (pannello team, calendario, form, carico di lavoro)
src/lib/            logica condivisa (vincoli, filtri, pratiche) con i relativi *.check.ts
docker-compose.yml  backend + caricamento del database
start.ps1           avvio completo in locale (Windows)
```
