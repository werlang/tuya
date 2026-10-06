# Frontend

Static files in `panel/public/`, served by `express.static`. No bundler, no framework. ES modules only.

## Structure

```text
panel/public/
  index.html                   # semantic shell: device card + power card
  styles.css                   # CSS variables + cards/meta/pill styles
  js/app.js                    # bootstrap: getElement() + PowerCard + DeviceInfo wiring
  js/components/power-card.js  # PowerCard class — live status pill + power/reset buttons
  js/components/device-info.js # DeviceInfo class — detail, rename, copy ID
  js/components/schedule-card.js # ScheduleCard class — timer form + pending table
  js/components/toaster.js # Toaster class — stacked auto-dismiss notifications
  js/models/device.js          # frontend Device model — the only module that calls the API
  js/helpers/api-client.js     # getJson / postJson / putJson fetch wrapper, throws Error with .code/.details
```

Rules (match the code): page code never calls `fetch` directly — it goes through `Device.*` / `Schedule.*`. Domain state lives in component fields (`isBusy`, `device`, `statusLookup` Map), not in `data-*` attributes. `data-hook` attributes are selector hooks only.

## Behavior

- `DeviceInfo.init()` loads `GET /api/device` and renders the identity card (name, product, category, firmware, device ID with copy button). Failures show an inline `role="alert"` error. The rename editor stays hidden until the pencil button reveals it (a global `[hidden]` rule guards against CSS `display` overriding it).
- Rename is inline: pencil button reveals the editor (Enter saves, Escape cancels, Save posts `PUT /api/device`). Empty names are rejected client-side; server errors surface as error toasts.
- The status pill shows the live state (`ON` / `OFF` / `offline` / `unknown` / `error`, green pulsing dot only when `online && switch_1`, disabled animation under `prefers-reduced-motion`) plus an amber `update` chip when `firmware_update_available` is true.
- `ScheduleCard.init()` toggles countdown vs. fixed-time inputs, posts to `/api/schedules`, and polls the pending-timers table every 5s (action badge, browser-local when, remaining countdown, per-row Cancel). Countdown input is minutes/hours (max 14 days); fixed-time input is `datetime-local`, converted to an absolute UTC instant client-side so the server timezone never matters.
- `Power ON/OFF` → `POST /api/control { switch_1 }`. `Reset` / `Force Reset` → `window.confirm("<mode> PC Gamer?")` then `POST /api/control { ModeReset }`.
- While a request is in flight all four power buttons are `disabled`. Outcomes surface as toasts from the shared `Toaster` (`#toasts`, `aria-live="polite"`): `Sending…` (info), `OK` (success), `Failed: <message>` (error, longer-lived, manually dismissible). A status refresh follows every successful command.
- Required element IDs: `page`, `status-dot`, `status-text`, `btn-on`, `btn-off`, `btn-reset`, `btn-force-reset`, `message`. `getElement()` throws `Missing required element: #<id>` if any is absent; `DeviceInfo.hook()` throws `Missing device card hook: <name>` for missing `data-hook` nodes.

## Changing UI

- Markup in `index.html`, look in `styles.css` (theme via `:root` variables, 2-column `.meta` grid collapsing to 1 column under `28rem`, segmented `.seg` controls, scoped `.sched-table`, wrapping form rows plus tighter padding under `28rem`), behavior in the three components. Keep `api-client.js` free of device-specific paths and `app.js` free of business logic.
