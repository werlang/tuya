# Operations

## First-time setup

```bash
cp .env.example .env
# edit .env: TUYA_API_KEY=sk-... (from https://tuya.ai/ Get Started -> API Key)
#          TUYA_DEVICE_ID=<device id>, TUYA_BASE_URL=<data-center URL, optional>
docker compose up --build -d
docker compose exec tuya tuya init
docker compose exec tuya tuya doctor
docker compose up -d panel
open http://localhost:8080
```

## Environment

| Var | Required | Default | Used by |
| --- | --- | --- | --- |
| `TUYA_API_KEY` | yes (for real calls) | — | `tuya` CLI init, panel `Authorization: Bearer` |
| `TUYA_DEVICE_ID` | yes (for real calls) | — | panel device endpoints |
| `TUYA_BASE_URL` | no | derived from key prefix (`sk-<XX>`: AY/AZ/EU/IN/UE/WE/SG) else `https://openapi.tuyaus.com` | panel upstream base |
| `PANEL_PORT` | no | `8080` | panel listen port (invalid → `8080`) |
| `SCHEDULE_FILE` | no | `panel/data/schedules.json` | timer state file (gitignored) |
| `NODE_ENV` | no | `production` in Compose | panel static cache (`1h` only in production, else `0`) |

`.env`, `config/`, `panel/node_modules/`, and `panel/data/` are gitignored. `config/` holds `tuya-cli` auth state — delete it (or re-run `tuya init`) if CLI auth breaks. Never commit real keys or device IDs.

Timers persist in `panel/data/schedules.json` (JSON array, written atomically on every change). Restarting the `panel` container re-arms future timers; past-due ones are dropped with a log line, never fired catch-up. The container timezone is irrelevant — fixed times are stored as absolute instants from the browser's timezone. Override the path with `SCHEDULE_FILE` if needed.

## Docker services

- `tuya`: built from `Dockerfile`, idles on `tail -f /dev/null`. `stdin_open`/`tty` are set for interactive `exec`.
- `panel`: `node:26-alpine`, `./panel:/app` bind mount, `8080:8080`, command `npm install --omit=dev --no-audit --no-fund && npm start`. Fresh checkouts have no `node_modules` — the container installs on every start.

Local panel dev (no Docker): `cd panel && npm install && npm run dev` (`node --watch src/server.js`). Export the `TUYA_*` vars first or `/api/*` returns `NOT_CONFIGURED`.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| `/api/health` → `configured: false` | `.env` missing/empty `TUYA_API_KEY` or `TUYA_DEVICE_ID`; Compose needs restart to pick up `.env` changes |
| `/api/status` → 500 `NOT_CONFIGURED` | same as above |
| `/api/*` → 504 `TUYA_TIMEOUT` | Tuya data-center unreachable or wrong `TUYA_BASE_URL`; verify key prefix mapping |
| `/api/control` → 502 `TUYA_COMMAND_FAILED` | Tuya rejected the shadow command; `details` in the response holds the raw payload |
| Panel shows `offline`/`unknown` | device powered off or Tuya `detail` omitted fields — compare with `docker compose exec tuya tuya doctor` |
| `panel` container exits on `npm install` | no network or corrupted bind-mounted `node_modules`; `rm -rf panel/node_modules && docker compose up -d panel` |
| CLI auth errors | `docker compose exec tuya tuya doctor`, then `tuya init` again; `./config` is the persisted state |
