import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const defaultScheduleFile = path.resolve(currentDir, '../data/schedules.json');

const DATA_CENTER_MAP = {
  AY: 'https://openapi.tuyacn.com',
  AZ: 'https://openapi.tuyaus.com',
  EU: 'https://openapi.tuyaeu.com',
  IN: 'https://openapi.tuyain.com',
  UE: 'https://openapi-ueaz.tuyaus.com',
  WE: 'https://openapi-weaz.tuyaeu.com',
  SG: 'https://openapi-sg.iotbing.com',
};

const DEFAULT_BASE_URL = 'https://openapi.tuyaus.com';

/**
 * Map a Tuya API key prefix to its data-center base URL.
 * @param {string} apiKey API key (e.g. sk-AZ...).
 * @returns {string} Base URL for the Tuya OpenAPI.
 */
export function baseUrlFromKey(apiKey) {
  const prefix = (String(apiKey || '').slice(3, 5) || '').toUpperCase();
  return DATA_CENTER_MAP[prefix] || DEFAULT_BASE_URL;
}

/**
 * Load and normalize panel configuration from the environment.
 * @param {NodeJS.ProcessEnv} [env] Environment source (defaults to process.env).
 * @returns {{ port: number, apiKey: string, deviceId: string, baseUrl: string, scheduleFile: string, isConfigured: boolean }} Normalized config.
 */
export function loadConfig(env = process.env) {
  const port = Number.parseInt(env.PANEL_PORT || '8080', 10);
  const apiKey = (env.TUYA_API_KEY || '').trim();
  const deviceId = (env.TUYA_DEVICE_ID || '').trim();
  const baseUrl = (env.TUYA_BASE_URL || '').trim() || baseUrlFromKey(apiKey);

  return {
    port: Number.isSafeInteger(port) && port > 0 ? port : 8080,
    apiKey,
    deviceId,
    baseUrl,
    scheduleFile: (env.SCHEDULE_FILE || '').trim() || defaultScheduleFile,
    isConfigured: Boolean(apiKey && deviceId),
  };
}
