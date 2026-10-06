# Tuya CLI (Dockerized)

Terminal control for Tuya WiFi board (pablo-gaming power). No local node required.

## Setup

```bash
cp .env.example .env
# put sk-XX... from https://tuya.ai/ (Get Started -> API Key)
docker compose up --build -d
docker compose exec tuya tuya init
docker compose exec tuya tuya doctor
```

## Use

```bash
# list / on / off
docker compose exec tuya tuya device control <device_id> '{"switch_1": true}'
docker compose exec tuya tuya device control <device_id> '{"switch_1": false}'

# one-shot without started service
docker compose run --rm tuya tuya --help
```

## Panel (port 8080)

Express + static frontend dashboard for PC Gamer.

```bash
docker compose up -d panel
open http://localhost:8080
```

- `GET /` — device info + power buttons + capabilities (status polls every 5s)
- `GET /api/health` — `{ok, configured}`
- `GET /api/status` — `{online, switch_1}`
- `GET /api/device` — full detail (name, product, firmware, properties)
- `GET /api/model` — Thing Model capabilities
- `POST /api/control {"switch_1": true|false}` or `{"ModeReset": "Reset"|"forceReset"}`
- `PUT /api/device {"name": "..."}` — rename (1–64 chars)
- `GET /api/schedules` — pending one-shot timers (file-backed, re-armed on restart)
- `POST /api/schedules {"action": "off", "inSeconds": 1800}` or `{"action": "on", "at": "<ISO instant>"}`
- `DELETE /api/schedules/<id>` — cancel a timer

Layout (`./panel`):

```text
panel/
  package.json
  src/
    server.js            # listen + graceful shutdown
    app.js               # express composition (helmet, morgan, static, routes)
    config.js            # env parsing + data-center base URL
    routes/device.js     # status / device / model / control / rename
    routes/schedules.js  # one-shot timers (in-memory)
    model/device.js      # Tuya OpenAPI entity
    model/schedule.js    # timer validation + lifecycle
    helpers/response.js  # ok/fail/asyncHandler
    helpers/scheduleStore.js # atomic JSON timer state
    middlewares/errorHandler.js
  public/
    index.html                   # device card + power card
    styles.css
    js/app.js                    # bootstrap
    js/components/power-card.js  # live status + power/reset buttons
    js/components/device-info.js # detail + rename + copy ID
    js/components/schedule-card.js # timers form + table
    js/components/toaster.js     # stacked auto-dismiss notifications
    js/models/device.js          # API access
    js/models/schedule.js        # timer API access
    js/helpers/api-client.js     # fetch wrapper
```

Local dev without Docker:

```bash
cd panel
npm install
npm run dev
```

Config persists in `./config` (`/root/.tuya-cli`).

## Docs

- `AGENTS.md` — agent guide (setup, conventions, validation, guardrails)
- `docs/architecture.md` — services + request flow
- `docs/panel-api.md` — API contracts + error codes
- `docs/frontend.md` — frontend structure + behavior
- `docs/operations.md` — env vars, Docker, troubleshooting
