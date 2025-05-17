import { keyCodeToHTML } from './keys.js';

async function refreshPinnedTabs() {
  const result = await chrome.runtime.sendMessage({ command: 'listPins' });
  if (!result.success) {
    throw new Error(result.errorMessage);
  }
  const pins = result.result;
  document.querySelectorAll('#keyboard .key').forEach((key) => {
    key.innerHTML = '';
  });
  Object.keys(pins).forEach((key) => {
    const pin = pins[key];
    const keyDiv = document.getElementById(`key${key}`);
    keyDiv.innerHTML = `<img class="icon" src="${pin.favIconUrl}" />`;
  });
}

document.addEventListener('DOMContentLoaded', refreshPinnedTabs);

document.addEventListener('keydown', async (event) => {
  if (!keyCodeToHTML.has(event.code)) {
    return;
  }
  if (event.code === 'Backspace' && event.ctrlKey) {
    // Pinning the Backspace key manually is not allowed. It's reserved for jumping back.
    return;
  }
  if (event.ctrlKey) {
    await chrome.runtime.sendMessage({ command: 'pinTab', args: { key: event.code } });
  } else if (event.shiftKey) {
    await chrome.runtime.sendMessage({ command: 'summonTab', args: { key: event.code } });
  } else if (event.altKey) {
    await chrome.runtime.sendMessage({ command: 'removePin', args: { key: event.code } });
    await refreshPinnedTabs();
    return;
  } else {
    await chrome.runtime.sendMessage({ command: 'focusTab', args: { key: event.code } });
  }
  window.close();
});

