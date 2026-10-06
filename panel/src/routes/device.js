import { Router } from 'express';
import { sendFail, sendOk, asyncHandler } from '../helpers/response.js';
import { Device } from '../model/device.js';

/**
 * Send NOT_CONFIGURED unless the device has credentials.
 * @param {Device} device Device entity.
 * @param {import('express').Response} res Express response.
 * @returns {boolean} True when configured (caller should proceed).
 */
export function requireConfigured(device, res) {
  if (device.isConfigured) return true;
  sendFail(res, {
    status: 500,
    code: 'NOT_CONFIGURED',
    message: 'Server is missing TUYA_API_KEY or TUYA_DEVICE_ID.',
  });
  return false;
}

/**
 * Build the /api router for device status, control, detail, model, and rename.
 * @param {{ device: Device }} options Router dependencies.
 * @returns {import('express').Router} Configured router.
 */
export function buildDeviceRouter({ device }) {
  const router = Router();

  router.get(
    '/status',
    asyncHandler(async (_req, res) => {
      if (!requireConfigured(device, res)) return;
      const status = await device.getStatus();
      sendOk(res, status);
    }),
  );

  router.get(
    '/device',
    asyncHandler(async (_req, res) => {
      if (!requireConfigured(device, res)) return;
      const detail = await device.getDetail();
      sendOk(res, detail);
    }),
  );

  router.get(
    '/model',
    asyncHandler(async (_req, res) => {
      if (!requireConfigured(device, res)) return;
      const model = await device.getModel();
      sendOk(res, model);
    }),
  );

  router.post(
    '/control',
    asyncHandler(async (req, res) => {
      if (!requireConfigured(device, res)) return;

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

  router.put(
    '/device',
    asyncHandler(async (req, res) => {
      if (!requireConfigured(device, res)) return;

      const parsed = Device.parseName(req.body);
      if ('error' in parsed) {
        sendFail(res, { status: 400, code: parsed.code, message: parsed.error });
        return;
      }

      const result = await device.renameDevice(parsed.name);
      if (!result.success) {
        sendFail(res, {
          status: 502,
          code: 'TUYA_COMMAND_FAILED',
          message: 'Tuya rejected the rename.',
          details: result.raw,
        });
        return;
      }
      sendOk(res, { success: true, name: parsed.name, data: result.raw });
    }),
  );

  return router;
}
