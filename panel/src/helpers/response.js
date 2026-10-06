/**
 * Send a success JSON payload.
 * @param {import('express').Response} res Express response.
 * @param {unknown} data Payload (object or array).
 * @param {number} [status] HTTP status code.
 * @returns {void}
 */
export function sendOk(res, data, status = 200) {
  res.status(status).json(data);
}

/**
 * Send a structured error JSON payload with a machine-readable code.
 * @param {import('express').Response} res Express response.
 * @param {object} options Error options.
 * @param {number} [options.status] HTTP status code.
 * @param {string} options.code Stable machine-readable code (e.g. VALIDATION_ERROR).
 * @param {string} options.message Human-readable message.
 * @param {unknown} [options.details] Optional extra details.
 * @returns {void}
 */
export function sendFail(res, { status = 500, code, message, details }) {
  const body = { error: message, code, message };
  if (details !== undefined) body.details = details;
  res.status(status).json(body);
}

/**
 * Wrap an async route handler so rejections reach Express error middleware.
 * @param {import('express').RequestHandler} handler Async route handler.
 * @returns {import('express').RequestHandler} Wrapped handler.
 */
export function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}
