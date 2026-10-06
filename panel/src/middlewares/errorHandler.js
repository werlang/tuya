import { sendFail } from '../helpers/response.js';

/**
 * Catch-all 404 handler for unknown routes.
 * @param {import('express').Request} req Express request.
 * @param {import('express').Response} res Express response.
 * @returns {void}
 */
export function notFoundHandler(req, res) {
  if (req.path.startsWith('/api/')) {
    sendFail(res, {
      status: 404,
      code: 'NOT_FOUND',
      message: `No route for ${req.method} ${req.path}.`,
    });
    return;
  }
  res.status(404).sendFile('404.html', { root: res.locals.publicDir }, () => {
    res.status(404).type('text/plain').send('Not found');
  });
}

/**
 * Central error handler. Translates thrown errors into structured JSON for
 * API routes and plain 500s otherwise.
 * @param {unknown} err Thrown error.
 * @param {import('express').Request} req Express request.
 * @param {import('express').Response} res Express response.
 * @param {import('express').NextFunction} _next Next middleware (unused).
 * @returns {void}
 */
export function errorHandler(err, req, res, _next) {
  const status =
    typeof err?.status === 'number' && err.status >= 400 && err.status < 600
      ? err.status
      : 500;
  const code =
    typeof err?.code === 'string' ? err.code : 'INTERNAL_ERROR';

  console.error(`[panel] ${req.method} ${req.path} -> ${code}:`, err?.message || err);

  if (req.path.startsWith('/api/')) {
    sendFail(res, {
      status,
      code,
      message:
        status === 500
          ? 'Unexpected server error.'
          : err?.message || 'Request failed.',
      details: status === 500 ? undefined : err?.details,
    });
    return;
  }
  res.status(status).type('text/plain').send('Internal Server Error');
}
