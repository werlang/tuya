/**
 * Minimal JSON HTTP client for same-origin API calls.
 * @param {string} path Path starting with /.
 * @param {{ method?: string, body?: unknown }} [options] Request options.
 * @returns {Promise<any>} Parsed JSON payload.
 */
export async function requestJson(path, { method = 'GET', body } = {}) {
  const response = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message = payload?.message || payload?.error || `Request failed (${response.status})`;
    const error = new Error(message);
    error.code = payload?.code;
    error.details = payload;
    throw error;
  }

  return payload;
}

export const getJson = (path) => requestJson(path);

export const postJson = (path, body) => requestJson(path, { method: 'POST', body });
