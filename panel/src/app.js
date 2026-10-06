import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { buildDeviceRouter } from './routes/device.js';
import { buildScheduleRouter } from './routes/schedules.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';
import { sendOk } from './helpers/response.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const defaultPublicDir = path.resolve(currentDir, '../public');

/**
 * Create the configured Express application.
 * @param {object} options App dependencies.
 * @param {{ isConfigured: boolean }} options.config Panel config.
 * @param {import('./model/device.js').Device} options.device Device entity.
 * @param {import('./model/schedule.js').Scheduler} options.scheduler Timer scheduler.
 * @param {string} [options.publicDir] Directory serving static frontend files.
 * @returns {import('express').Express} Configured app.
 */
export function createApp({ config, device, scheduler, publicDir = defaultPublicDir }) {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(morgan('tiny'));
  app.use(express.json({ limit: '16kb' }));

  // Make the static dir visible to the 404 handler without globals.
  app.use((req, res, next) => {
    res.locals.publicDir = publicDir;
    next();
  });

  app.get('/api/health', (_req, res) => {
    sendOk(res, { ok: true, configured: config.isConfigured });
  });

  app.use('/api', buildDeviceRouter({ device }));
  app.use('/api/schedules', buildScheduleRouter({ scheduler, device }));

  app.use(
    express.static(publicDir, {
      index: 'index.html',
      maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
    }),
  );

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
