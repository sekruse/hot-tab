import { keyCodeToHTML, createIcon } from './keys.js';
import { lpc } from './lpc.js';
import toast from './toast.js';

async function refreshPinnedTabs() {
  const pins = await lpc('listPins');
  document.querySelectorAll('#keyboard .key').forEach((key) => {
    key.innerHTML = '';
  });
  Object.keys(pins).forEach((key) => {
    const pin = pins[key];
    const keyDiv = document.getElementById(`key${key}`);
    keyDiv.replaceChildren(createIcon(pin));
  });
}

document.addEventListener('DOMContentLoaded', () => {
  toast.init();
  toast.catch(() => {
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
    await lpc('pinTab', { key: event.code });
  } else if (event.shiftKey) {
    await lpc('summonTab', { key: event.code });
  } else if (event.altKey) {
    await lpc('removePin', { key: event.code });
    toast.show(`Pin for ${event.code} removed.`, 3000);
    await refreshPinnedTabs();
    return;
  } else {
    await lpc('focusTab', { key: event.code });
  }
  window.close();
}));

