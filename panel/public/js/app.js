import { PowerCard } from './components/power-card.js';

/**
 * Query a required element by id.
 * @param {string} id Element id.
 * @returns {HTMLElement} Found element.
 */
function getElement(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing required element: #${id}`);
  return element;
}

function bootstrap() {
  const card = new PowerCard({
    elements: {
      statusDot: getElement('status-dot'),
      statusText: getElement('status-text'),
      btnOn: getElement('btn-on'),
      btnOff: getElement('btn-off'),
      btnReset: getElement('btn-reset'),
      btnForceReset: getElement('btn-force-reset'),
      message: getElement('message'),
    },
  });
  card.init();
}

bootstrap();
