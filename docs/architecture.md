# Architecture

Two Compose services, one device. No database, no auth layer, no test suite in repo.

## Services

- `tuya` (`Dockerfile`): image built from `node:26-alpine` + `git clone https://github.com/tuya/tuya-smart-control-cli.git` + `npm install` + `npm link`. Runs `tail -f /dev/null` so it idles for `docker compose exec`. CLI state lives in `./config`, mounted to `/root/.tuya-cli`.
- `panel` (`panel/`): Node >= 20 Express app. No built image — `compose.yaml` uses `node:26-alpine` with `./panel:/app` bind mount and starts with `npm install && npm start`. Listens on `PANEL_PORT` (default `8080`, published as `8080:8080`).

## Panel request flow

```text
browser (panel/public) ── GET /api/status ─▶ Express (/api) ── GET detail ─▶ Tuya OpenAPI
browser ── POST /api/control ─▶ validate (Device.parseControlBody) ── POST issue ─▶ Tuya OpenAPI
browser ── POST /api/schedules ─▶ validate (Scheduler.parseScheduleBody) ── setTimeout ─▶ issueProperties ─▶ Tuya OpenAPI
browser ── GET / ─▶ express.static (panel/public/index.html)
```

- `panel/src/server.js`: loads config, constructs one `Device` and one `Scheduler` (wired to `issueProperties`), calls `createApp()`, listens, handles `SIGINT`/`SIGTERM` (clear timers, close, 5s force-exit).
- `panel/src/app.js` (`createApp({ config, device, publicDir })`): `helmet` (CSP disabled), `morgan('tiny')`, `express.json({ limit: '16kb' })`, `GET /api/health`, `buildDeviceRouter` at `/api`, `express.static(publicDir)` (1h cache only when `NODE_ENV=production`), then 404 + error handlers.
- `panel/src/model/device.js` (`Device`): the only place that calls Tuya. `getStatus()` normalizes to `{ online, switch_1 }` (`null` when absent/non-boolean). `getDetail()` returns identity + firmware + raw `properties`. `getModel()` parses the Thing Model `model` JSON string and flattens it to `{ modelId, properties[] }` with display `spec` strings (`MODEL_PARSE_ERROR` → 502 on invalid JSON). `issueProperties()` posts shadow properties. `renameDevice()` posts `{ name }` to the `attribute` endpoint. `requestJson()` adds `Authorization: Bearer <apiKey>`, 10s `AbortController` timeout, and throws `TUYA_UPSTREAM_ERROR` / `TUYA_TIMEOUT` with `status` + `details`.
- `panel/src/model/schedule.js` (`Scheduler`): in-memory one-shot timers. `parseScheduleBody()` validates exactly one of `inSeconds`/`at` (max 14 days, future only); `schedule()` caps 20 jobs with `randomUUID` ids; `fire()` drops the job then runs the injected `execute`, logging failures without retry; `cancel()`/`list()`/`shutdown()` manage lifecycle.
- `panel/src/routes/device.js`: HTTP boundary only — `requireConfigured()` guard, `GET /status`, `GET /device`, `GET /model`, `POST /control` (via `Device.parseControlBody()`), `PUT /device` rename (via `Device.parseName()`, max 64 chars), results mapped to `sendOk`/`sendFail`.
- `panel/src/routes/schedules.js`: `GET /` list, `POST /` create (201, 429 `TOO_MANY` at capacity), `DELETE /:id` cancel (404 `SCHEDULE_NOT_FOUND`), same `requireConfigured` guard.
- `panel/src/helpers/response.js`: `sendOk(res, data)`, `sendFail(res, { status, code, message, details })` → `{ error, code, message, details? }`, `asyncHandler()` forwards rejections to Express error middleware.
- `panel/src/middlewares/errorHandler.js`: `notFoundHandler` (JSON `NOT_FOUND` for `/api/*`; otherwise tries `404.html` in `publicDir` and falls back to plain-text `Not found` — no `404.html` exists today), `errorHandler` (JSON for `/api/*`, plain-text 500-equivalent otherwise; 500s hide internals as `Unexpected server error`).

## Tuya upstream

Base URL from `TUYA_BASE_URL`, else `baseUrlFromKey(TUYA_API_KEY)` mapping `sk-<XX>` prefix (`AY/AZ/EU/IN/UE/WE/SG`, default `https://openapi.tuyaus.com`).

- `GET {base}/v1.0/end-user/devices/{deviceId}/detail`
- `POST {base}/v1.0/end-user/devices/{deviceId}/shadow/properties/issue` with body `{ "properties": "<stringified {switch_1?, ModeReset?}>" }`

## Configuration

`panel/src/config.js` `loadConfig(env)`: `PANEL_PORT` (default `8080`, invalid → `8080`), trimmed `TUYA_API_KEY` / `TUYA_DEVICE_ID`, `TUYA_BASE_URL` or derived, `isConfigured = apiKey && deviceId`. Unconfigured panel still boots and serves `/`, but `/api/status` and `/api/control` return 500 `NOT_CONFIGURED`.
