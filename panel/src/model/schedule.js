import { randomUUID } from 'node:crypto';

const MAX_DELAY_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_JOBS = 20;

function isRecord(value) {
  return typeof value === 'object' && value !== null;
}

/**
 * In-memory one-shot scheduler. Owns pending timers and their validation.
 * Durability is delegated outward: callers persist `persist()` output
 * (e.g. via helpers/scheduleStore.js) and re-arm via `restore()`.
 */
export class Scheduler {
  /**
   * @param {object} options Constructor options.
   * @param {(action: 'on' | 'off') => Promise<unknown>} options.execute Called when a job fires.
   * @param {number} [options.maxJobs] Maximum pending jobs.
   * @param {() => void} [options.onChange] Called after every mutation (schedule/cancel/fire).
   */
  constructor({ execute, maxJobs = MAX_JOBS, onChange = () => {} }) {
    this.execute = execute;
    this.maxJobs = maxJobs;
    this.onChange = onChange;
    this.jobs = new Map();
  }

  /**
   * Validate and normalize a schedule request body.
   * Accepts exactly one of `inSeconds` (countdown) or `at` (ISO datetime).
   * Fixed times arrive as absolute ISO instants produced by the caller's
   * clock, so the server timezone never matters.
   * @param {unknown} body Raw request body.
   * @param {number} [now] Current epoch ms (injectable for tests).
   * @returns {{ action: 'on' | 'off', kind: 'in' | 'at', runAt: string } | { error: string, code: string }} Validation result.
   */
  static parseScheduleBody(body, now = Date.now()) {
    if (!isRecord(body)) {
      return { error: 'Request body must be a JSON object.', code: 'INVALID_BODY' };
    }
    const { action, inSeconds, at } = body;
    if (action !== 'on' && action !== 'off') {
      return { error: 'action must be "on" or "off".', code: 'INVALID_ACTION' };
    }

    const hasIn = inSeconds !== undefined;
    const hasAt = at !== undefined;
    if (hasIn && hasAt) {
      return {
        error: 'Provide either inSeconds or at, not both.',
        code: 'INVALID_SCHEDULE',
      };
    }
    if (!hasIn && !hasAt) {
      return {
        error: 'Provide inSeconds or at.',
        code: 'INVALID_SCHEDULE',
      };
    }

    if (hasIn) {
      if (typeof inSeconds !== 'number' || !Number.isFinite(inSeconds)) {
        return { error: 'inSeconds must be a number.', code: 'INVALID_DELAY' };
      }
      const delayMs = Math.round(inSeconds * 1000);
      if (delayMs < 1000) {
        return { error: 'inSeconds must be at least 1.', code: 'INVALID_DELAY' };
      }
      if (delayMs > MAX_DELAY_MS) {
        return {
          error: 'Schedule is too far ahead (max 14 days).',
          code: 'TOO_FAR',
        };
      }
      return { action, kind: 'in', runAt: new Date(now + delayMs).toISOString() };
    }

    if (typeof at !== 'string') {
      return { error: 'at must be an ISO datetime string.', code: 'INVALID_TIME' };
    }
    const runAt = Date.parse(at);
    if (Number.isNaN(runAt)) {
      return { error: 'at must be an ISO datetime string.', code: 'INVALID_TIME' };
    }
    if (runAt <= now) {
      return { error: 'Time is in the past.', code: 'TIME_IN_PAST' };
    }
    if (runAt - now > MAX_DELAY_MS) {
      return {
        error: 'Schedule is too far ahead (max 14 days).',
        code: 'TOO_FAR',
      };
    }
    return { action, kind: 'at', runAt: new Date(runAt).toISOString() };
  }

  /**
   * Schedule a validated one-shot job.
   * @param {{ action: 'on' | 'off', kind: 'in' | 'at', runAt: string }} job Validated job.
   * @returns {{ job: { id: string, action: 'on' | 'off', kind: 'in' | 'at', runAt: string } } | { error: string, code: string }} Created job or capacity error.
   */
  schedule({ action, kind, runAt }) {
    if (this.jobs.size >= this.maxJobs) {
      return {
        error: `Too many scheduled timers (max ${this.maxJobs}).`,
        code: 'TOO_MANY',
      };
    }
    const id = randomUUID();
    const parsed = Date.parse(runAt);
    if (Number.isNaN(parsed)) {
      return { error: 'runAt must be an ISO datetime string.', code: 'INVALID_TIME' };
    }
    this.armJob({ id, action, kind, runAt });
    this.onChange();
    return { job: { id, action, kind, runAt } };
  }

  /**
   * Re-arm persisted jobs (e.g. after a restart). Past-due, invalid, and
   * over-capacity entries are dropped and counted, never fired catch-up.
   * @param {Array<{ id: string, action: 'on' | 'off', kind: 'in' | 'at', runAt: string }>} jobs Stored jobs.
   * @returns {{ restored: number, dropped: number }} Outcome counts.
   */
  restore(jobs) {
    let restored = 0;
    let dropped = 0;
    const now = Date.now();
    for (const job of jobs) {
      const valid =
        isRecord(job) &&
        typeof job.id === 'string' &&
        (job.action === 'on' || job.action === 'off') &&
        (job.kind === 'in' || job.kind === 'at') &&
        typeof job.runAt === 'string' &&
        Date.parse(job.runAt) > now;
      if (!valid || this.jobs.size >= this.maxJobs) {
        dropped += 1;
        continue;
      }
      this.armJob({ id: job.id, action: job.action, kind: job.kind, runAt: job.runAt });
      restored += 1;
    }
    if (restored > 0) this.onChange();
    return { restored, dropped };
  }

  /**
   * Cancel a pending job.
   * @param {string} id Job id.
   * @returns {boolean} True when a pending job was cancelled.
   */
  cancel(id) {
    const job = this.jobs.get(id);
    if (!job) return false;
    clearTimeout(job.timer);
    this.jobs.delete(id);
    this.onChange();
    return true;
  }

  /**
   * Persistable snapshot of pending jobs (no timers, no derived fields).
   * @returns {Array<{ id: string, action: 'on' | 'off', kind: 'in' | 'at', runAt: string }>} Storable jobs.
   */
  persist() {
    return [...this.jobs.values()].map(({ id, action, kind, runAt }) => ({
      id,
      action,
      kind,
      runAt,
    }));
  }

  /**
   * List pending jobs with remaining time.
   * @returns {Array<{ id: string, action: 'on' | 'off', kind: 'in' | 'at', runAt: string, remainingMs: number }>} Pending jobs.
   */
  list() {
    const now = Date.now();
    return [...this.jobs.values()].map(({ timer: _timer, ...job }) => ({
      ...job,
      remainingMs: Math.max(0, Date.parse(job.runAt) - now),
    }));
  }

  /** Clear all pending timers (used on shutdown). */
  shutdown() {
    for (const job of this.jobs.values()) clearTimeout(job.timer);
    this.jobs.clear();
  }

  /**
   * Run a due job: drop it from pending first, then execute.
   * Execution failures are logged; the job is not retried.
   * @param {string} id Job id.
   * @returns {Promise<void>}
   */
  async fire(id) {
    const job = this.jobs.get(id);
    if (!job) return;
    this.jobs.delete(id);
    this.onChange();
    try {
      await this.execute(job.action);
    } catch (error) {
      console.error(`[scheduler] job ${id} failed:`, error?.message || error);
    }
  }

  /**
   * Arm the setTimeout for a job record already present in validation.
   * @param {{ id: string, action: 'on' | 'off', kind: 'in' | 'at', runAt: string }} job Job record.
   * @returns {void}
   */
  armJob({ id, action, kind, runAt }) {
    const delayMs = Math.max(0, Date.parse(runAt) - Date.now());
    const timer = setTimeout(() => this.fire(id), delayMs);
    this.jobs.set(id, { id, action, kind, runAt, timer });
  }
}
