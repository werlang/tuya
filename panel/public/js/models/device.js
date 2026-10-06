import { getJson, postJson } from '../helpers/api-client.js';

/**
 * Frontend Device entity. All API access goes through this model.
 */
export class Device {
  /**
   * Fetch live status from the panel API.
   * @returns {Promise<{ online: boolean | null, switch_1: boolean | null }>} Normalized status.
   */
  static async fetchStatus() {
    return getJson('/api/status');
  }

  /**
   * Turn the main switch on or off.
   * @param {boolean} isOn Desired switch state.
   * @returns {Promise<unknown>} API result.
   */
  static async setSwitch(isOn) {
    return postJson('/api/control', { switch_1: isOn });
  }

  /**
   * Send a reset command to the device.
   * @param {'Reset' | 'forceReset'} mode Reset mode.
   * @returns {Promise<unknown>} API result.
   */
  static async sendReset(mode) {
    return postJson('/api/control', { ModeReset: mode });
  }
}
