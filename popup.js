import { keyCodeToHTML, createIcon, parseDigitKeycode } from './keys.js';
import { Client } from './lpc.js';
import toast from './toast.js';
import tooltip from './tooltip.js';

const background = new Client(['getState', 'setActiveKeysetId', 'listPins', 'pinTab', 'focusTab', 'summonTab', 'removePin']);

let keysetId;

async function refreshPinnedTabs() {
  const pins = await background.listPins({ keysetId: keysetId });
  document.querySelectorAll('#keyboard [data-keycode]').forEach((key) => {
    const keyCode = key.getAttribute('data-keycode');
    const digit = parseDigitKeycode(keyCode);
    if (!digit.exists) {
      key.innerHTML = '';
      key.removeAttribute('data-tooltip');
    } else {
      key.classList.toggle('key-highlighted', digit.value === keysetId);
    }
  });
  Object.keys(pins).forEach((key) => {
    const pin = pins[key];
    const keyDiv = document.getElementById(`key${key}`);
    if (!keyDiv) {
      throw new Error(`No keyDiv found for ${key} / ${JSON.stringify(pin)}`);
    }
    keyDiv.setAttribute('data-tooltip', pin.title);
    keyDiv.replaceChildren(createIcon(pin));
  });
}

async function handleKey(keyCode) {
  if (!keyCodeToHTML.has(keyCode)) {
    return;
  }
  const digit = parseDigitKeycode(keyCode);
  if (digit.exists) {
    await background.setActiveKeysetId({ keysetId: digit.value });
    keysetId = digit.value;
    await refreshPinnedTabs();
    return;
  }
  if (keyCode === 'Backspace' && event.ctrlKey) {
    // Pinning the Backspace key manually is not allowed. It's reserved for jumping back.
    return;
  }
  if (event.ctrlKey) {
    await background.pinTab({ key: keyCode, keysetId: keysetId });
  } else if (event.shiftKey) {
    await background.summonTab({ key: keyCode, keysetId: keysetId });
  } else if (event.altKey) {
    await background.removePin({ key: keyCode, keysetId: keysetId });
    toast.show(`Pin for ${keyCode} removed.`, 3000);
    await refreshPinnedTabs();
    return;
  } else {
    await background.focusTab({ key: keyCode, keysetId: keysetId });
  }
  window.close();
}

function addInputListeners() {
  document.querySelectorAll('[data-keycode]').forEach((key) => {
    key.addEventListener('click', toast.catch(async (event) => {
      const keyCode = event.currentTarget.getAttribute('data-keycode');
      await handleKey(keyCode);
    }));
  });
  document.addEventListener('keydown', toast.catch(async (event) => {
    await handleKey(event.code);
  }));
}


document.addEventListener('DOMContentLoaded', () => {
  toast.init();
  toast.catch(async () => {
    const state = await background.getState();
    keysetId = state.keysetId;
    tooltip.init();
    addInputListeners();
    await refreshPinnedTabs();
  })();
});


