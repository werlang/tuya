# Panel API

Base: `http://localhost:8080`. All `/api/*` responses are JSON. Errors use `{ error, code, message, details? }` where `error` and `message` carry the same human-readable text and `code` is stable for client mapping.

## `GET /api/health`

No credentials required. Reports whether the server can call Tuya.

```json
{ "ok": true, "configured": true }
```

## `GET /api/status`

Response: `{ online: boolean | null, switch_1: boolean | null }`. `null` means Tuya omitted the field or it was not a boolean.

Errors:

| HTTP | `code` | Meaning |
| --- | --- | --- |
| 500 | `NOT_CONFIGURED` | `TUYA_API_KEY` or `TUYA_DEVICE_ID` missing |
| 504 | `TUYA_TIMEOUT` | Tuya did not respond within 10s |
| 4xx/5xx | `TUYA_UPSTREAM_ERROR` | Tuya returned non-2xx (`details` holds its payload) |
| 500 | `INTERNAL_ERROR` | Unexpected failure (message hidden) |

Example:

```bash
curl http://localhost:8080/api/status
# {"online":true,"switch_1":false}
```

## `POST /api/control`

Content-Type `application/json`, max `16kb`. Body accepts `switch_1` (boolean) and/or `ModeReset` (`"Reset"` or `"forceReset"`); at least one is required. Both may be sent together — both are forwarded to Tuya.
```bash
curl -X POST http://localhost:8080/api/control \
  -H 'content-type: application/json' \
  -d '{"switch_1": true}'

curl -X POST http://localhost:8080/api/control \
  -H 'content-type: application/json' \
  -d '{"ModeReset": "Reset"}'
```

Success (Tuya accepted): `{ "success": true, "data": <tuya payload> }`.

Errors:

| HTTP | `code` | Meaning |
| --- | --- | --- |
| 400 | `INVALID_BODY` | Body is not a JSON object |
| 400 | `INVALID_SWITCH` | `switch_1` present but not boolean |
| 400 | `INVALID_MODE_RESET` | `ModeReset` is not `"Reset"`/`"forceReset"` |
| 400 | `EMPTY_COMMAND` | Neither `switch_1` nor `ModeReset` provided |
| 500 | `NOT_CONFIGURED` | Missing server credentials |
| 502 | `TUYA_COMMAND_FAILED` | Tuya responded with `success !== true` (`details` holds raw payload) |
| 504 | `TUYA_TIMEOUT` | Tuya did not respond within 10s |

Note: malformed JSON is rejected by `express.json()` before the route runs and surfaces via the central error handler as `400` with `code: "INTERNAL_ERROR"` and the parser message — clients should treat body-parse failures as generic 400s.

## `GET /api/device`

Full device detail (identity, firmware, live properties). Returns `500 NOT_CONFIGURED` when credentials are missing; upstream failures surface as `TUYA_TIMEOUT` / `TUYA_UPSTREAM_ERROR`.

```json
{
  "device_id": "YOUR_DEVICE_ID",
  "name": "PC Gamer",
  "category": "cz",
  "category_name": "Socket",
  "product_name": "Computer",
  "online": true,
  "firmware_version": "3.0.22",
  "firmware_update_available": false,
  "properties": { "switch_1": false, "_mode_reset": "0" }
}
```

`null` for `name`/`online`/etc. means Tuya omitted the field. `properties` passes through whatever live DPs Tuya reports.

## `GET /api/model`

Thing Model flattened to a capability list. Returns `500 NOT_CONFIGURED` when credentials are missing, `502 MODEL_PARSE_ERROR` when Tuya returns unparseable model JSON.

```json
{
  "modelId": "000003cctr",
  "properties": [
    { "code": "switch_1", "name": "Computer status", "access": "rw", "type": "bool", "spec": "true / false" },
    { "code": "ModeReset", "name": "Reset method", "access": "rw", "type": "enum", "spec": "Reset | forceReset | 0" }
  ]
}
```

`spec` is a display string built server-side: `bool` → `"true / false"`, `enum` → range joined with `" | "`, `value` → `"min–max step N unit"`, `string` → `"up to N chars"`.

## `PUT /api/device`

Rename the device. Body: `{ "name": "<1–64 chars>" }`. Success: `{ "success": true, "name": "<trimmed>", "data": <tuya payload> }`.

| HTTP | `code` | Meaning |
| --- | --- | --- |
| 400 | `INVALID_NAME` | `name` missing, not a string, or blank |
| 400 | `NAME_TOO_LONG` | `name` over 64 characters |
| 500 | `NOT_CONFIGURED` | Missing server credentials |
| 502 | `TUYA_COMMAND_FAILED` | Tuya responded with `success !== true` (`details` holds raw payload) |

```bash
curl -X PUT http://localhost:8080/api/device \
  -H 'content-type: application/json' \
  -d '{"name": "PC Gamer"}'
```

## Schedules (in-memory timers)

One-shot on/off timers kept in server memory — **a panel restart clears them**. Countdown (`inSeconds`) or fixed time (`at` as an absolute ISO instant).

Fixed times are produced by the caller's clock (the UI converts its `datetime-local` input with the browser timezone to UTC), so the server timezone never matters. Max horizon 14 days (also the `setTimeout` ceiling), max 20 pending timers.

```bash
# off in 30 minutes
curl -X POST http://localhost:8080/api/schedules \
  -H 'content-type: application/json' \
  -d '{"action": "off", "inSeconds": 1800}'

# on at a fixed time (absolute instant with offset)
curl -X POST http://localhost:8080/api/schedules \
  -H 'content-type: application/json' \
  -d '{"action": "on", "at": "2026-10-07T07:00:00-03:00"}'

# list pending (each has id, action, kind "in"|"at", runAt, remainingMs)
curl http://localhost:8080/api/schedules

# cancel
curl -X DELETE http://localhost:8080/api/schedules/<id>
```

`POST` returns `201 { id, action, kind, runAt }`. When a timer fires it issues the switch command once and drops off the list; a failed fire is logged server-side and not retried.

| HTTP | `code` | Meaning |
| --- | --- | --- |
| 400 | `INVALID_BODY` | Body is not a JSON object |
| 400 | `INVALID_ACTION` | `action` is not `"on"`/`"off"` |
| 400 | `INVALID_SCHEDULE` | Neither or both of `inSeconds`/`at` provided |
| 400 | `INVALID_DELAY` | `inSeconds` not a number or below 1 |
| 400 | `INVALID_TIME` | `at` is not an ISO datetime string |
| 400 | `TIME_IN_PAST` | `at` is not in the future |
| 400 | `TOO_FAR` | More than 14 days ahead |
| 404 | `SCHEDULE_NOT_FOUND` | No pending timer with that id (`DELETE`) |
| 429 | `TOO_MANY` | Over 20 pending timers |
| 500 | `NOT_CONFIGURED` | Missing server credentials |

## Static + fallback routes

- `GET /` → `panel/public/index.html`; `/styles.css`, `/js/*` via `express.static`.
- Unknown `/api/*` → `404 { error, code: "NOT_FOUND", message }`.
- Unknown non-API path → plain-text `Not found` (404). There is no custom `404.html` in the repo.
