import { Device } from '../models/device.js';

const POLL_INTERVAL_MS = 5000;

function labelForStatus(status) {
  if (!status || status.online === null) return 'unknown';
  if (status.online === false) return 'offline';
  return status.switch_1 ? 'ON' : 'OFF';
}

/**
 * Power card component. Owns all DOM behavior for the dashboard card.
 */
export class PowerCard {
  /**
   * @param {{ elements: Record<string, HTMLElement>, confirmFn?: (message: string) => boolean }} options Component options.
   */
  constructor({ elements, confirmFn = (message) => window.confirm(message) }) {
    this.elements = elements;
    this.confirmFn = confirmFn;
    this.statusLookup = new Map();
    this.isBusy = false;
  }

  /** Wire up buttons and start polling. */
  init() {
    this.elements.btnOn.addEventListener('click', () => this.handleSwitch(true));
    this.elements.btnOff.addEventListener('click', () => this.handleSwitch(false));
    this.elements.btnReset.addEventListener('click', () => this.handleReset('Reset'));
    this.elements.btnForceReset.addEventListener('click', () => this.handleReset('forceReset'));

    this.refresh();
    setInterval(() => this.refresh(), POLL_INTERVAL_MS);
  }

  /** Refresh status from the API and render it. */
  async refresh() {
    try {
      const status = await Device.fetchStatus();
      this.statusLookup.set('latest', status);
      this.renderStatus(status);
    } catch {
      this.renderStatus(null);
    }
  }

  /**
   * Render a status object into the DOM.
   * @param {{ online: boolean | null, switch_1: boolean | null } | null} status Status to render.
   */
  renderStatus(status) {
    const label = status ? labelForStatus(status) : 'error';
    const isOn = status?.online === true && status?.switch_1 === true;

    this.elements.statusText.textContent = label;
    this.elements.statusDot.classList.toggle('is-on', isOn);
    this.elements.statusDot.classList.toggle('is-off', !isOn);
  }

  /**
   * Handle an ON/OFF button press.
   * @param {boolean} isOn Desired state.
   */
  async handleSwitch(isOn) {
    if (this.isBusy) return;
    this.setBusy(true, 'Sending…');
    try {
      await Device.setSwitch(isOn);
      this.setMessage('OK');
      await this.refresh();
    } catch (error) {
      this.setMessage(`Failed: ${error.message}`);
    } finally {
      this.setBusy(false);
    }
  }

  /**
   * Handle a reset button press (with confirmation).
   * @param {'Reset' | 'forceReset'} mode Reset mode.
   */
  async handleReset(mode) {
    if (this.isBusy) return;
    if (!this.confirmFn(`${mode} PC Gamer?`)) return;
    this.setBusy(true, 'Sending…');
    try {
      await Device.sendReset(mode);
      this.setMessage('OK');
      await this.refresh();
    } catch (error) {
      this.setMessage(`Failed: ${error.message}`);
    } finally {
      this.setBusy(false);
    }
  }

  /**
   * Enable/disable buttons and show a transient message.
   * @param {boolean} isBusy Whether a request is in flight.
   * @param {string} [message] Message to show while busy.
   */
  setBusy(isBusy, message = '') {
    this.isBusy = isBusy;
    for (const button of this.allButtons()) {
      button.disabled = isBusy;
    }
    if (isBusy) this.setMessage(message);
  }

  /** @returns {HTMLButtonElement[]} All card buttons. */
  allButtons() {
    return [
      this.elements.btnOn,
      this.elements.btnOff,
      this.elements.btnReset,
      this.elements.btnForceReset,
    ];
  }

  /**
   * Show a status message.
   * @param {string} message Message text.
   */
  setMessage(message) {
    this.elements.message.textContent = message;
  }
}
