import { Router } from 'express';
import { sendFail, sendOk, asyncHandler } from '../helpers/response.js';
import { Scheduler } from '../model/schedule.js';
import { requireConfigured } from './device.js';

/**
 * Build the /api/schedules router for one-shot on/off timers.
 * @param {{ scheduler: Scheduler, device: import('../model/device.js').Device }} options Router dependencies.
 * @returns {import('express').Router} Configured router.
 */
export function buildScheduleRouter({ scheduler, device }) {
  const router = Router();

  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      if (!requireConfigured(device, res)) return;
      sendOk(res, scheduler.list());
    }),
  );

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      if (!requireConfigured(device, res)) return;

      const parsed = Scheduler.parseScheduleBody(req.body);
      if ('error' in parsed) {
        sendFail(res, { status: 400, code: parsed.code, message: parsed.error });
        return;
      }

      const created = scheduler.schedule(parsed);
      if ('error' in created) {
        sendFail(res, { status: 429, code: created.code, message: created.error });
        return;
      }
      sendOk(res, created.job, 201);
    }),
  );

  router.delete(
    '/:id',
    asyncHandler(async (req, res) => {
      if (!requireConfigured(device, res)) return;
      if (!scheduler.cancel(req.params.id)) {
        sendFail(res, {
          status: 404,
          code: 'SCHEDULE_NOT_FOUND',
          message: 'No pending timer with that id.',
        });
        return;
      }
      sendOk(res, { success: true });
    }),
  );

  return router;
}
