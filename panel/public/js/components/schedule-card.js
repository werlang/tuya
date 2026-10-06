import { Schedule } from '../models/schedule.js';

const POLL_INTERVAL_MS = 5000;
const MAX_MINUTES = 20160;

/**
 * Format a remaining duration for the table.
 * @param {number} ms Remaining milliseconds.
 * @returns {string} Human duration (e.g. "in 25 min", "in 2 h 15 min").
 */
function formatRemaining(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  if (totalSeconds < 60) return `in ${totalSeconds} s`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) return `in ${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  if (hours < 24) {
    const minutes = totalMinutes % 60;
    return minutes === 0 ? `in ${hours} h` : `in ${hours} h ${minutes} min`;
  }
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours === 0 ? `in ${days} d` : `in ${days} d ${restHours} h`;
}

/**
 * Format an ISO instant in the browser's timezone.
 * @param {string} iso ISO datetime.
 * @returns {string} Local date + time.
 */
function formatWhen(iso) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Timers component. Owns the schedule form and the pending-timers table.
 * Selects nodes via data-hook attributes; timer data lives in fields.
 */
export class ScheduleCard {
  /**
   * @param {{ root: HTMLElement, notify?: (message: string, type?: 'info' | 'success' | 'error') => void }} options Component options.
   */
  constructor({ root, notify = () => {} }) {
    this.root = root;
    this.notify = notify;
    this.isSaving = false;
    this.hooks = {};
    for (const element of root.querySelectorAll('[data-hook]')) {
      this.hooks[element.dataset.hook] = element;
    }
  }

  /** Wire up the form and start polling. */
  init() {
    for (const mode of this.modeRadios()) {
      mode.addEventListener('change', () => this.renderMode());
    }
    for (const button of this.createButtons()) {
      button.addEventListener('click', () => this.create());
    }
    this.renderMode();
    this.load();
    setInterval(() => this.load(), POLL_INTERVAL_MS);
  }

  /** Show the countdown or fixed-time inputs per the selected mode. */
  renderMode() {
    const mode = this.selectedMode();
    this.hook('panel-in').hidden = mode !== 'in';
    this.hook('panel-at').hidden = mode !== 'at';
  }

  /** Fetch pending timers and render the table. */
  async load() {
    try {
      const timers = await Schedule.list();
      this.renderTimers(Array.isArray(timers) ? timers : []);
      this.setError('');
    } catch (error) {
      this.setError(`Couldn't load timers: ${error.message}`);
    }
  }

  /**
   * Render timer rows (built with createElement, never innerHTML).
   * @param {Array<{ id: string, action: 'on' | 'off', kind: 'in' | 'at', runAt: string, remainingMs: number }>} timers Pending timers.
   */
  renderTimers(timers) {
    const body = this.hook('timer-body');
    body.replaceChildren();
    this.hook('timer-table').hidden = timers.length === 0;
    this.hook('timer-empty').hidden = timers.length > 0;
    for (const timer of timers) {
      const row = document.createElement('tr');

      const actionCell = document.createElement('td');
      const badge = document.createElement('span');
      badge.className = `badge ${timer.action === 'on' ? 'badge-green' : 'badge-red'}`;
      badge.textContent = timer.action === 'on' ? 'Turn on' : 'Turn off';
      actionCell.append(badge);

      const whenCell = document.createElement('td');
      whenCell.textContent = formatWhen(timer.runAt);

      const inCell = document.createElement('td');
      inCell.textContent = formatRemaining(timer.remainingMs);

      const cancelCell = document.createElement('td');
      const cancelButton = document.createElement('button');
      cancelButton.type = 'button';
      cancelButton.className = 'btn btn-small btn-danger';
      cancelButton.textContent = 'Cancel';
      cancelButton.addEventListener('click', () => this.cancel(timer.id, cancelButton));
      cancelCell.append(cancelButton);

      row.append(actionCell, whenCell, inCell, cancelCell);
      body.append(row);
    }
  }

  /** Validate the form and create the timer. */
  async create() {
    if (this.isSaving) return;
    const action = this.selectedAction();
    let payload;
    if (this.selectedMode() === 'in') {
      const amount = Number(this.hook('amount').value);
      if (!Number.isFinite(amount) || amount <= 0) {
        this.notify('Enter minutes or hours above zero.', 'error');
        return;
      }
      const minutes = this.hook('unit').value === 'hours' ? amount * 60 : amount;
      if (minutes > MAX_MINUTES) {
        this.notify('Too far ahead (max 14 days).', 'error');
        return;
      }
      payload = { action, inSeconds: Math.round(minutes * 60) };
    } else {
      const value = this.hook('at').value;
      if (!value) {
        this.notify('Pick a date and time.', 'error');
        return;
      }
      const runAt = new Date(value);
      if (Number.isNaN(runAt.getTime())) {
        this.notify('Pick a valid date and time.', 'error');
        return;
      }
      if (runAt.getTime() <= Date.now()) {
        this.notify('Time is in the past.', 'error');
        return;
      }
      // Local wall time -> absolute instant; server timezone never matters.
      payload = { action, at: runAt.toISOString() };
    }

    this.isSaving = true;
    this.setCreateBusy(true);
    try {
      await Schedule.create(payload);
      this.notify('Timer set.', 'success');
      await this.load();
    } catch (error) {
      this.notify(`Couldn't set timer: ${error.message}`, 'error');
    } finally {
      this.isSaving = false;
      this.setCreateBusy(false);
    }
  }

  /**
   * Cancel one timer.
   * @param {string} id Timer id.
   * @param {HTMLButtonElement} button Cancel button (disabled while cancelling).
   */
  async cancel(id, button) {
    button.disabled = true;
    try {
      await Schedule.cancel(id);
      this.notify('Timer cancelled.', 'success');
      await this.load();
    } catch (error) {
      this.notify(`Couldn't cancel timer: ${error.message}`, 'error');
      button.disabled = false;
    }
  }

  /** @returns {'on' | 'off'} Selected action. */
  selectedAction() {
    const checked = this.root.querySelector('input[name="sched-action"]:checked');
    return checked?.value === 'on' ? 'on' : 'off';
  }

  /** @returns {'in' | 'at'} Selected mode. */
  selectedMode() {
    const checked = this.root.querySelector('input[name="sched-mode"]:checked');
    return checked?.value === 'at' ? 'at' : 'in';
  }

  /** @returns {HTMLButtonElement[]} Both Add timer buttons (one per mode panel). */
  createButtons() {
    return [this.hook('create'), this.hook('create-at')];
  }

  /**
   * Enable/disable both Add timer buttons.
   * @param {boolean} isBusy Whether a create is in flight.
   */
  setCreateBusy(isBusy) {
    for (const button of this.createButtons()) {
      button.disabled = isBusy;
    }
  }

  /** @returns {HTMLInputElement[]} Mode radio inputs. */
  modeRadios() {
    return [...this.root.querySelectorAll('input[name="sched-mode"]')];
  }

  /**
   * Show or clear the card error message.
   * @param {string} message Error text (empty clears).
   */
  setError(message) {
    const error = this.hook('error');
    error.textContent = message;
    error.hidden = !message;
  }

  /**
   * Required hook lookup (throws when the markup is incomplete).
   * @param {string} name data-hook name.
   * @returns {HTMLElement} Hook element.
   */
  hook(name) {
    const element = this.hooks[name];
    if (!element) throw new Error(`Missing timers card hook: ${name}`);
    return element;
  }
}
