import { PowerCard } from './components/power-card.js';
import { DeviceInfo } from './components/device-info.js';
import { ScheduleCard } from './components/schedule-card.js';

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
  const message = getElement('message');
  const notify = (text) => {
    message.textContent = text;
  };

  const power = new PowerCard({
    elements: {
      statusDot: getElement('status-dot'),
      statusText: getElement('status-text'),
      btnOn: getElement('btn-on'),
      btnOff: getElement('btn-off'),
      btnReset: getElement('btn-reset'),
      btnForceReset: getElement('btn-force-reset'),
      message,
    },
  });
  power.init();

  const info = new DeviceInfo({ root: getElement('page'), notify });
  info.init();

  const schedules = new ScheduleCard({ root: getElement('schedules-card'), notify });
  schedules.init();
}

bootstrap();
