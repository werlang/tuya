const SUCCESS_MS = 4000;
const INFO_MS = 4000;
const ERROR_MS = 6000;

const DURATION_BY_TYPE = {
  success: SUCCESS_MS,
  info: INFO_MS,
  error: ERROR_MS,
};

/**
 * Toast stack. Owns the notification container: shows dismissible
 * toasts that auto-expire. Callers pass plain text (rendered via
 * textContent, never HTML).
 */
export class Toaster {
  /**
   * @param {{ root: HTMLElement }} options Component options.
   */
  constructor({ root }) {
    this.root = root;
  }

  /**
   * Show a toast.
   * @param {string} message Plain-text message.
   * @param {'info' | 'success' | 'error'} [type] Visual variant.
   * @returns {() => void} Dismiss function for this toast.
   */
  show(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const text = document.createElement('span');
    text.textContent = message;
    toast.append(text);

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'toast-close';
    close.setAttribute('aria-label', 'Dismiss notification');
    close.textContent = '×';
    close.addEventListener('click', () => toast.remove());
    toast.append(close);

    this.root.append(toast);
    const timer = setTimeout(() => toast.remove(), DURATION_BY_TYPE[type] || INFO_MS);
    return () => {
      clearTimeout(timer);
      toast.remove();
    };
  }
}
