import { Router } from 'express';
import { sendFail, sendOk, asyncHandler } from '../helpers/response.js';
import { Device } from '../model/device.js';

/**
 * Build the /api router for device status and control.
 * @param {{ device: Device }} options Router dependencies.
 * @returns {import('express').Router} Configured router.
 */
export function buildDeviceRouter({ device }) {
  const router = Router();

  router.get(
    '/status',
    asyncHandler(async (_req, res) => {
      if (!device.isConfigured) {
        sendFail(res, {
          status: 500,
          code: 'NOT_CONFIGURED',
          message: 'Server is missing TUYA_API_KEY or TUYA_DEVICE_ID.',
        });
        return;
      }
      const status = await device.getStatus();
      sendOk(res, status);
    }),
  );

  router.post(
    '/control',
    asyncHandler(async (req, res) => {
      if (!device.isConfigured) {
        sendFail(res, {
          status: 500,
          code: 'NOT_CONFIGURED',
          message: 'Server is missing TUYA_API_KEY or TUYA_DEVICE_ID.',
        });
        return;
      }

      const parsed = Device.parseControlBody(req.body);
      if ('error' in parsed) {
        sendFail(res, { status: 400, code: parsed.code, message: parsed.error });
        return;
      }

      const result = await device.issueProperties(parsed.properties);
      if (!result.success) {
        sendFail(res, {
          status: 502,
          code: 'TUYA_COMMAND_FAILED',
          message: 'Tuya rejected the command.',
          details: result.raw,
        });
        return;
      }
      sendOk(res, { success: true, data: result.raw });
    }),
  );

  return router;
}
