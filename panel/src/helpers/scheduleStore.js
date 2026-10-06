import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

function isRecord(value) {
  return typeof value === 'object' && value !== null;
}

function isStorableJob(value) {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    (value.action === 'on' || value.action === 'off') &&
    (value.kind === 'in' || value.kind === 'at') &&
    typeof value.runAt === 'string' &&
    !Number.isNaN(Date.parse(value.runAt))
  );
}

/**
 * Load persisted timer jobs. Missing or corrupt files yield an empty
 * list (with a warning) so boot never fails on state.
 * @param {string} filePath JSON file path.
 * @returns {Promise<Array<{ id: string, action: 'on' | 'off', kind: 'in' | 'at', runAt: string }>>} Shape-valid stored jobs.
 */
export async function loadJobs(filePath) {
  let raw;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.warn(`[schedules] cannot read ${filePath}:`, error?.message || error);
    }
    return [];
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.warn(`[schedules] corrupt state at ${filePath}, starting empty:`, error?.message || error);
    return [];
  }
  if (!Array.isArray(parsed)) {
    console.warn(`[schedules] state at ${filePath} is not a list, starting empty`);
    return [];
  }
  const valid = parsed.filter(isStorableJob);
  if (valid.length !== parsed.length) {
    console.warn(`[schedules] dropped ${parsed.length - valid.length} invalid entr(ies) from ${filePath}`);
  }
  return valid.map(({ id, action, kind, runAt }) => ({ id, action, kind, runAt }));
}

/**
 * Persist timer jobs atomically (write tmp file + rename).
 * @param {string} filePath JSON file path.
 * @param {Array<{ id: string, action: 'on' | 'off', kind: 'in' | 'at', runAt: string }>} jobs Jobs to store.
 * @returns {Promise<void>}
 */
export async function saveJobs(filePath, jobs) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(jobs, null, 2)}\n`, 'utf8');
  await rename(tmpPath, filePath);
}
