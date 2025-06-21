import { keyCodeToHTML, createIcon } from './keys.js';
import { Client } from './lpc.js';
import toast from './toast.js';
import tooltip from './tooltip.js';

const background = new Client(['listPins', 'pinTab', 'focusTab', 'summonTab', 'removePin']);

// TODO: Allow to use multiple keysets.
const KEYSET_ID = 0;

async function refreshPinnedTabs() {
  const pins = await background.listPins({ keysetId: KEYSET_ID });
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

function addClickListeners() {
  document.querySelectorAll('[data-keycode]').forEach((key) => {
    key.addEventListener('click', async (event) => {
      const keyCode = event.currentTarget.getAttribute('data-keycode');
      if (keyCode === 'Backspace' && event.ctrlKey) {
        // Pinning the Backspace key manually is not allowed. It's reserved for jumping back.
        return;
      }
      if (event.ctrlKey) {
        await background.pinTab({ key: keyCode, keysetId: KEYSET_ID });
      } else if (event.shiftKey) {
        await background.summonTab({ key: keyCode, keysetId: KEYSET_ID });
      } else if (event.altKey) {
        await background.removePin({ key: keyCode, keysetId: KEYSET_ID });
        toast.show(`Pin for ${keyCode} removed.`, 3000);
        await refreshPinnedTabs();
        return;
      } else {
        await background.focusTab({ key: keyCode, keysetId: KEYSET_ID });
      }
      window.close();
    });
  });
}


document.addEventListener('DOMContentLoaded', () => {
  toast.init();
  toast.catch(async () => {
    tooltip.init();
    addClickListeners();
    await refreshPinnedTabs({keysetId: KEYSET_ID });
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
    await background.pinTab({ key: event.code, keysetId: KEYSET_ID });
  } else if (event.shiftKey) {
    await background.summonTab({ key: event.code, keysetId: KEYSET_ID });
  } else if (event.altKey) {
    await background.removePin({ key: event.code, keysetId: KEYSET_ID });
    toast.show(`Pin for ${event.code} removed.`, 3000);
    await refreshPinnedTabs();
    return;
  } else {
    await background.focusTab({ key: event.code, keysetId: KEYSET_ID });
  }
  window.close();
}));

