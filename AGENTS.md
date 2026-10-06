# AGENTS.md

Agent guide for this repo. Code and config are the source of truth; do not preserve claims here that the code does not enforce.

## Project overview

Dockerized Tuya WiFi board control (PC Gamer power). Two Compose services:

- `tuya` — CLI built from `Dockerfile` (`tuya-smart-control-cli` via `npm link`). Interactive; idles on `tail -f /dev/null`. Config persists in `./config` (`/root/.tuya-cli` in container).
- `panel` — Express dashboard on port `8080` (`panel/src/server.js` → `panel/src/app.js`). Serves static frontend from `panel/public/` and proxies a single device via the Tuya OpenAPI.

## Repo map

```text
compose.yaml          # tuya + panel services
Dockerfile            # builds tuya CLI image only (panel uses node:26-alpine + bind mount)
.env / .env.example   # TUYA_API_KEY, TUYA_DEVICE_ID, TUYA_BASE_URL (never commit .env)
config/               # gitignored tuya-cli auth state (bind-mounted)
panel/
  package.json        # type: module, scripts: start/dev, deps: express/helmet/morgan
  src/
    server.js            # listen + SIGINT/SIGTERM shutdown
    app.js               # createApp({config, device, scheduler, publicDir}) — helmet, morgan, json, static, /api, 404, errors
    config.js            # loadConfig(), baseUrlFromKey()
    routes/device.js     # buildDeviceRouter({device}) — status/device/model/control/rename
    routes/schedules.js  # buildScheduleRouter({scheduler, device}) — one-shot timers
    model/device.js      # Device entity — all Tuya HTTP lives here
    model/schedule.js    # Scheduler entity — timer validation + lifecycle
    helpers/response.js  # sendOk / sendFail / asyncHandler
    helpers/scheduleStore.js # atomic JSON timer state (loadJobs / saveJobs)
    middlewares/errorHandler.js  # notFoundHandler / errorHandler
  public/
    index.html                   # device card + power card
    styles.css
    js/app.js                    # bootstrap only
    js/components/power-card.js  # PowerCard: live status + power/reset buttons
    js/components/device-info.js # DeviceInfo: detail + rename + copy ID
    js/components/schedule-card.js # ScheduleCard: timer form + pending table
    js/components/toaster.js     # Toaster: stacked auto-dismiss notifications
    js/models/device.js          # frontend Device model
    js/models/schedule.js        # frontend Schedule model
    js/helpers/api-client.js     # getJson / postJson / putJson / deleteJson fetch wrapper
docs/
  architecture.md  # service + request flow
  panel-api.md     # API contracts + error codes
  frontend.md      # frontend structure + behavior
  operations.md    # setup, env, Docker, troubleshooting
```

## Setup and commands

```bash
cp .env.example .env   # then fill TUYA_API_KEY (sk-...), TUYA_DEVICE_ID
docker compose up --build -d
docker compose exec tuya tuya init
docker compose exec tuya tuya doctor
docker compose up -d panel
open http://localhost:8080
```

Useful:

```bash
docker compose exec tuya tuya device control <device_id> '{"switch_1": true}'
docker compose run --rm tuya tuya --help
cd panel && npm install && npm run dev   # local panel dev (node --watch), needs .env vars
```

## Conventions (enforced by current code)

- ESM only (`"type": "module"`). Named exports only — no default exports.
- Backend split: `routes/` parses/validates HTTP, `model/Device` owns Tuya HTTP + `parseControlBody()`, `helpers/` has no route logic, `middlewares/` has cross-cutting handlers.
- API errors are `{ error, code, message, details? }` with a stable `code` (see `docs/panel-api.md`).
- Frontend API access goes only through `public/js/models/` (`device.js`, `schedule.js`); page bootstrap (`js/app.js`) only wires components; DOM state lives in component fields/`Map`, never `data-*` attributes.
- JSDoc on exported functions/methods (matches existing style).
- Keep it small: no auth layer, no DB, no tests in repo. Prefer flat, direct code over new abstractions.

## Validation before finishing

- `cd panel && npm install` must succeed (Node >= 20).
- `node --check` every file under `panel/src/` and `panel/public/js/` after touching them.
- Boot with dummy creds and curl: `/api/health` → `{"ok":true,...}`, `/` → 200 HTML, `/styles.css` + `/js/app.js` → 200, `POST /api/control -d '{}'` → 400 `EMPTY_COMMAND`, `PUT /api/device -d '{}'` → 400 `INVALID_NAME`, `POST /api/schedules -d '{"action":"off"}'` → 400 `INVALID_SCHEDULE`.
- If you change routes, env vars, ports, or file paths, update `README.md`, `docs/`, and this file in the same pass.

## Guardrails

- Never commit `.env`, `config/`, `panel/node_modules/`, or `panel/data/` (all gitignored). Never paste real `sk-` keys or device IDs into docs or chat.
- Tuya upstream timeout is 10s (`TUYA_TIMEOUT` → 504). Do not raise `express.json()` limit (`16kb`) without reason.
- `panel` container runs `npm install` on start (bind mount, no built image). Do not assume `node_modules` exists on a fresh checkout.
- No `404.html` exists: non-API 404s fall back to plain-text `Not found`. Do not document a custom 404 page.
