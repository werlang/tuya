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
   * Fetch full device detail (identity, firmware, live properties).
   * @returns {Promise<{ device_id: string, name: string | null, category: string | null, category_name: string | null, product_name: string | null, online: boolean | null, firmware_version: string | null, firmware_update_available: boolean, properties: Record<string, unknown> }>} Normalized detail.
   */
  async getDetail() {
    const payload = await this.requestJson(
      `/v1.0/end-user/devices/${this.deviceId}/detail`,
      { method: 'GET' },
    );
    const result = isRecord(payload?.result) ? payload.result : {};
    const textOrNull = (value) =>
      typeof value === 'string' && value ? value : null;

    return {
      device_id:
        typeof result.device_id === 'string' && result.device_id
          ? result.device_id
          : this.deviceId,
      name: textOrNull(result.name),
      category: textOrNull(result.category),
      category_name: textOrNull(result.category_name),
      product_name: textOrNull(result.product_name),
      online: typeof result.online === 'boolean' ? result.online : null,
      firmware_version: textOrNull(result.firmware_version),
      firmware_update_available: result.firmware_update_available === true,
      properties: isRecord(result.properties) ? result.properties : {},
    };
  }

  /**
   * Fetch the device Thing Model and flatten it to a capability list.
   * @returns {Promise<{ modelId: string | null, properties: Array<{ code: string, name: string, access: string, type: string, spec: string }> }>} Normalized capabilities.
   */
  async getModel() {
    const payload = await this.requestJson(
      `/v1.0/end-user/devices/${this.deviceId}/model`,
      { method: 'GET' },
    );
    const raw = payload?.result?.model;
    let parsed;
    try {
      parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
      const err = new Error('Device model was not valid JSON');
      err.code = 'MODEL_PARSE_ERROR';
      err.status = 502;
      throw err;
    }
    const services = Array.isArray(parsed?.services) ? parsed.services : [];
    const properties = [];
    for (const service of services) {
      if (!isRecord(service) || !Array.isArray(service.properties)) continue;
      for (const prop of service.properties) {
        if (!isRecord(prop) || typeof prop.code !== 'string') continue;
        properties.push(Device.describeProperty(prop));
      }
    }
    return {
      modelId: typeof parsed?.modelId === 'string' ? parsed.modelId : null,
      properties,
    };
  }

  /**
   * Rename the device.
   * @param {string} name Validated new name.
   * @returns {Promise<{ success: boolean, raw: unknown }>} Tuya result.
   */
  async renameDevice(name) {
    const payload = await this.requestJson(
      `/v1.0/end-user/devices/${this.deviceId}/attribute`,
      { method: 'POST', body: JSON.stringify({ name }) },
    );
    return { success: payload?.success === true, raw: payload };
  }

  /**
   * Validate and normalize a rename request body.
   * @param {unknown} body Raw request body.
   * @returns {{ name: string } | { error: string, code: string }} Validation result.
   */
  static parseName(body) {
    if (!isRecord(body) || typeof body.name !== 'string') {
      return { error: 'Name must be a string.', code: 'INVALID_NAME' };
    }
    const name = body.name.trim();
    if (!name) {
      return { error: 'Name must not be empty.', code: 'INVALID_NAME' };
    }
    if (name.length > 64) {
      return { error: 'Name must be 64 characters or fewer.', code: 'NAME_TOO_LONG' };
    }
    return { name };
  }

  /**
   * Normalize one Thing Model property to a frontend-friendly shape.
   * @param {Record<string, unknown>} prop Raw property from the Thing Model.
   * @returns {{ code: string, name: string, access: string, type: string, spec: string }} Normalized capability.
   */
  static describeProperty(prop) {
    const spec = isRecord(prop.typeSpec) ? prop.typeSpec : {};
    return {
      code: prop.code,
      name: typeof prop.name === 'string' && prop.name ? prop.name : prop.code,
      access: typeof prop.accessMode === 'string' ? prop.accessMode : 'rw',
      type: typeof spec.type === 'string' ? spec.type : 'raw',
      spec: Device.describeSpec(spec),
    };
  }

  /**
   * Render a human-readable spec string for a Thing Model type spec.
   * @param {Record<string, unknown>} spec Raw typeSpec object.
   * @returns {string} Human-readable spec (e.g. "Reset | forceReset", "10–1000 step 1").
   */
  static describeSpec(spec) {
    if (spec.type === 'bool') return 'true / false';
    if (spec.type === 'enum') {
      return Array.isArray(spec.range) && spec.range.length > 0
        ? spec.range.join(' | ')
        : 'enum';
    }
    if (spec.type === 'value') {
      const min = spec.min ?? '?';
      const max = spec.max ?? '?';
      const step = spec.step != null ? ` step ${spec.step}` : '';
      const unit = spec.unit ? ` ${spec.unit}` : '';
      return `${min}–${max}${step}${unit}`.trim();
    }
    if (spec.type === 'string') {
      return spec.maxlen != null ? `up to ${spec.maxlen} chars` : 'string';
    }
    return typeof spec.type === 'string' ? spec.type : '-';
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
