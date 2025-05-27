import { keyCodeToHTML, createIcon } from './keys.js';
import { Client } from './lpc.js';
import toast from './toast.js';
import tooltip from './tooltip.js';

const background = new Client(['listPins', 'pinTab', 'focusTab', 'summonTab', 'removePin']);

async function refreshPinnedTabs() {
  const pins = await background.listPins();
  document.querySelectorAll('#keyboard .key').forEach((key) => {
    key.innerHTML = '';
    key.removeAttribute('data-tooltip');
  });
  Object.keys(pins).forEach((key) => {
    const pin = pins[key];
    const keyDiv = document.getElementById(`key${key}`);
    keyDiv.setAttribute('data-tooltip', pin.title);
    keyDiv.replaceChildren(createIcon(pin));
  });
}


document.addEventListener('DOMContentLoaded', () => {
  toast.init();
  toast.catch(() => {
    tooltip.init();
    refreshPinnedTabs();
  })();
});

document.addEventListener('keydown', toast.catch(async (event) => {
  if (!keyCodeToHTML.has(event.code)) {
    return;
  }
  if (event.code === 'Backspace' && event.ctrlKey) {
    // Pinning the Backspace key manually is not allowed. It's reserved for jumping back.
    return;
  }
  if (event.ctrlKey) {
    await background.pinTab({ key: event.code });
  } else if (event.shiftKey) {
    await background.summonTab({ key: event.code });
  } else if (event.altKey) {
    await background.removePin({ key: event.code });
    toast.show(`Pin for ${event.code} removed.`, 3000);
    await refreshPinnedTabs();
    return;
  } else {
    await background.focusTab({ key: event.code });
  }
  window.close();
}));

