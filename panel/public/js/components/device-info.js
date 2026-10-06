import { Device } from '../models/device.js';

/**
 * Device info component. Owns the identity card: device detail,
 * rename flow, and device-ID copy.
 * Selects nodes via data-hook attributes; domain data lives in fields.
 */
export class DeviceInfo {
  /**
   * @param {{ root: HTMLElement, notify?: (message: string) => void }} options Component options (root is the device card).
   */
  constructor({ root, notify = () => {} }) {
    this.root = root;
    this.notify = notify;
    this.device = null;
    this.isEditing = false;
    this.isSaving = false;
    this.hooks = {};
    for (const element of root.querySelectorAll('[data-hook]')) {
      this.hooks[element.dataset.hook] = element;
    }
  }

  /** Wire up controls and load device data. */
  init() {
    this.hook('edit-name').addEventListener('click', () => this.startEditing());
    this.hook('cancel-rename').addEventListener('click', () => this.stopEditing());
    this.hook('save-rename').addEventListener('click', () => this.saveName());
    this.hook('name-input').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') this.saveName();
      if (event.key === 'Escape') this.stopEditing();
    });
    this.hook('copy-id').addEventListener('click', () => this.copyDeviceId());
    this.load();
  }

  /**
   * Load device detail and render it.
   */
  async load() {
    this.setBusy(true);
    try {
      const device = await Device.fetchDevice();
      this.device = device;
      this.renderDevice(device);
      this.setError('');
    } catch (error) {
      this.setError(`Couldn't load device info: ${error.message}`);
    } finally {
      this.setBusy(false);
    }
  }

  /**
   * Render identity fields from a detail payload.
   * @param {{ name: string | null, product_name: string | null, category_name: string | null, category: string | null, firmware_version: string | null, firmware_update_available: boolean, device_id: string }} device Detail payload.
   */
  renderDevice(device) {
    this.hook('name').textContent = device.name || 'Unnamed device';
    this.hook('product').textContent = device.product_name || '—';
    this.hook('category').textContent =
      device.category_name || device.category || '—';
    this.hook('firmware').textContent = device.firmware_version || '—';
    this.hook('update-badge').hidden = !device.firmware_update_available;
    this.hook('device-id').textContent = device.device_id;
    if (!this.isEditing) {
      this.hook('name-input').value = device.name || '';
    }
  }

  /** Show the inline rename editor. */
  startEditing() {
    if (this.isEditing) return;
    this.isEditing = true;
    this.hook('name-input').value = this.device?.name || '';
    this.hook('editor').hidden = false;
    this.hook('edit-name').hidden = true;
    this.hook('name-input').focus();
    this.hook('name-input').select();
  }

  /** Hide the inline rename editor without saving. */
  stopEditing() {
    this.isEditing = false;
    this.hook('editor').hidden = true;
    this.hook('edit-name').hidden = false;
  }

  /** Validate and submit the rename form. */
  async saveName() {
    if (this.isSaving) return;
    const name = this.hook('name-input').value.trim();
    if (!name) {
      this.notify('Name must not be empty.', 'error');
      return;
    }
    this.isSaving = true;
    this.hook('save-rename').disabled = true;
    try {
      await Device.renameDevice(name);
      this.device = { ...(this.device || {}), name };
      this.hook('name').textContent = name;
      this.stopEditing();
      this.notify('Name updated.', 'success');
    } catch (error) {
      this.notify(`Rename failed: ${error.message}`, 'error');
    } finally {
      this.isSaving = false;
      this.hook('save-rename').disabled = false;
    }
  }

  /** Copy the device ID to the clipboard. */
  async copyDeviceId() {
    const deviceId = this.device?.device_id || '';
    if (!deviceId) return;
    try {
      await navigator.clipboard.writeText(deviceId);
      this.notify('Device ID copied.', 'success');
    } catch {
      this.notify('Copy failed — select the ID manually.', 'error');
    }
  }

  /**
   * Mark the card busy while loading.
   * @param {boolean} isBusy Whether a load is in flight.
   */
  setBusy(isBusy) {
    this.root.setAttribute('aria-busy', String(isBusy));
  }

  /**
   * Show or clear the card error message.
   * @param {string} message Error text (empty clears).
   */
  setError(message) {
    const error = this.hook('error');
    error.textContent = message;
    error.hidden = !message;
  }

  /**
   * Required hook lookup (throws when the markup is incomplete).
   * @param {string} name data-hook name.
   * @returns {HTMLElement} Hook element.
   */
  hook(name) {
    const element = this.hooks[name];
    if (!element) throw new Error(`Missing device card hook: ${name}`);
    return element;
  }
}
