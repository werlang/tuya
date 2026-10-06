import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { Device } from './model/device.js';
import { Scheduler } from './model/schedule.js';

const config = loadConfig();
const device = new Device({
  apiKey: config.apiKey,
  deviceId: config.deviceId,
  baseUrl: config.baseUrl,
});
const scheduler = new Scheduler({
  execute: async (action) => {
    const result = await device.issueProperties({ switch_1: action === 'on' });
    if (!result.success) {
      throw new Error('Tuya rejected the scheduled command');
    }
  },
});
const app = createApp({ config, device, scheduler });

const server = app.listen(config.port, () => {
  console.log(`panel listening on :${config.port}`);
  if (!config.isConfigured) {
    console.warn(
      'panel is missing TUYA_API_KEY or TUYA_DEVICE_ID — /api/status will return NOT_CONFIGURED until configured.',
    );
  }
});

function shutdown(signal) {
  console.log(`received ${signal}, closing...`);
  scheduler.shutdown();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
