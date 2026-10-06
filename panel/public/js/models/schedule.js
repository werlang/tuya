import { getJson, postJson, deleteJson } from '../helpers/api-client.js';

/**
 * Frontend Schedule entity. All timer API access goes through this model.
 */
export class Schedule {
  /**
   * List pending timers.
   * @returns {Promise<Array<{ id: string, action: 'on' | 'off', kind: 'in' | 'at', runAt: string, remainingMs: number }>>} Pending timers.
   */
  static async list() {
    return getJson('/api/schedules');
  }

  /**
   * Create a one-shot timer.
   * @param {{ action: 'on' | 'off', inSeconds?: number, at?: string }} timer Timer spec (inSeconds countdown or at ISO instant).
   * @returns {Promise<{ id: string, action: 'on' | 'off', kind: 'in' | 'at', runAt: string }>} Created timer.
   */
  static async create(timer) {
    const body = { action: timer.action };
    if (timer.inSeconds !== undefined) body.inSeconds = timer.inSeconds;
    if (timer.at !== undefined) body.at = timer.at;
    return postJson('/api/schedules', body);
  }

  /**
   * Cancel a pending timer.
   * @param {string} id Timer id.
   * @returns {Promise<unknown>} API result.
   */
  static async cancel(id) {
    return deleteJson(`/api/schedules/${encodeURIComponent(id)}`);
  }
}
