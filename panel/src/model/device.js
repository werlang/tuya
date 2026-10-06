const REQUEST_TIMEOUT_MS = 10_000;

function isRecord(value) {
  return typeof value === 'object' && value !== null;
}

/**
 * Tuya device entity. Owns all Tuya OpenAPI access for a single device.
 */
export class Device {
  /**
   * @param {object} options Constructor options.
   * @param {string} options.apiKey Tuya end-user bearer token.
   * @param {string} options.deviceId Tuya device id.
   * @param {string} options.baseUrl Tuya OpenAPI base URL.
   * @param {typeof fetch} [options.fetchFn] Fetch implementation (for tests).
   */
  constructor({ apiKey, deviceId, baseUrl, fetchFn = fetch }) {
    this.apiKey = apiKey;
    this.deviceId = deviceId;
    this.baseUrl = String(baseUrl || '').replace(/\/+$/, '');
    this.fetchFn = fetchFn;
  }

  /**
   * Whether the instance has the credentials needed to call Tuya.
   * @returns {boolean} True when apiKey and deviceId are present.
   */
  get isConfigured() {
    return Boolean(this.apiKey && this.deviceId);
  }

  /**
   * Fetch live device status (online flag + switch_1 state).
   * @returns {Promise<{ online: boolean | null, switch_1: boolean | null }>} Normalized status.
   */
  async getStatus() {
    const payload = await this.requestJson(
      `/v1.0/end-user/devices/${this.deviceId}/detail`,
      { method: 'GET' },
    );
    const result = isRecord(payload?.result) ? payload.result : {};
    const properties = isRecord(result.properties) ? result.properties : {};

    return {
      online: typeof result.online === 'boolean' ? result.online : null,
      switch_1:
        typeof properties.switch_1 === 'boolean'
          ? properties.switch_1
          : null,
    };
  }

  /**
   * Issue shadow properties to the device.
   * @param {{ switch_1?: boolean, ModeReset?: string }} properties Validated properties.
   * @returns {Promise<{ success: boolean, raw: unknown }>} Tuya result.
   */
  async issueProperties(properties) {
    const payload = await this.requestJson(
      `/v1.0/end-user/devices/${this.deviceId}/shadow/properties/issue`,
      {
        method: 'POST',
        body: JSON.stringify({ properties: JSON.stringify(properties) }),
      },
    );
    return { success: payload?.success === true, raw: payload };
  }

  /**
   * Validate and normalize a control request body.
   * @param {unknown} body Raw request body.
   * @returns {{ properties: { switch_1?: boolean, ModeReset?: string } } | { error: string, code: string }} Validation result.
   */
  static parseControlBody(body) {
    if (!isRecord(body)) {
      return { error: 'Request body must be a JSON object.', code: 'INVALID_BODY' };
    }

    const properties = {};

    if ('switch_1' in body) {
      if (typeof body.switch_1 !== 'boolean') {
        return { error: 'switch_1 must be a boolean.', code: 'INVALID_SWITCH' };
      }
      properties.switch_1 = body.switch_1;
    }

    if ('ModeReset' in body) {
      if (body.ModeReset !== 'Reset' && body.ModeReset !== 'forceReset') {
        return { error: 'ModeReset must be "Reset" or "forceReset".', code: 'INVALID_MODE_RESET' };
      }
      properties.ModeReset = body.ModeReset;
    }

    if (Object.keys(properties).length === 0) {
      return { error: 'Nothing to do: provide switch_1 or ModeReset.', code: 'EMPTY_COMMAND' };
    }

    return { properties };
  }

  /**
   * Perform a JSON request against the Tuya OpenAPI.
   * @param {string} path Path starting with /.
   * @param {{ method?: string, body?: string }} [init] Request options.
   * @returns {Promise<any>} Parsed JSON payload.
   */
  async requestJson(path, init = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await this.fetchFn(`${this.baseUrl}${path}`, {
        method: init.method || 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
        },
        body: init.body,
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const err = new Error(`Tuya API responded with HTTP ${response.status}`);
        err.code = 'TUYA_UPSTREAM_ERROR';
        err.status = response.status;
        err.details = payload;
        throw err;
      }
      return payload;
    } catch (err) {
      if (err?.name === 'AbortError') {
        const timeout = new Error('Tuya API request timed out');
        timeout.code = 'TUYA_TIMEOUT';
        timeout.status = 504;
        throw timeout;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}
