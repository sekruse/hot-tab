import { keyCodeToHTML } from './keys.js';
import { lpc } from './lpc.js';
import modal from './modal.js';

async function refreshPinnedTabs() {
  const result = await chrome.runtime.sendMessage({ command: 'listPins' });
  if (!result.success) {
    throw new Error(result.errorMessage);
  }
  const pins = result.result;
  const pinnedTabsList = document.getElementById('pinnedTabsList');
  pinnedTabsList.innerHTML = '';
  Object.keys(pins).sort().forEach((key) => {
    const pin = pins[key];
    const li = document.createElement('li');
    li.classList.add('tab', 'flex', 'flex-row');
    const keySpan = document.createElement('span');
    keySpan.classList.add('key', 'key-inline');
    keySpan.innerHTML = keyCodeToHTML.get(key);
    li.appendChild(keySpan);
    if (pin.favIconUrl) {
      const icon = document.createElement('img');
      icon.classList.add('icon', 'margin-left');
      icon.addEventListener('error', (event) => {
        icon.outerHTML = `<div class="icon-fallback margin-left">${pin.title[0]}${pin.title[1]}</div>`;
      });
      icon.setAttribute('src', pin.favIconUrl)
      li.appendChild(icon);
    };
    const title = document.createElement('span');
    title.classList.add('margin-left');
    title.innerText = pin.title;
    li.appendChild(title);
    li.addEventListener('click', (ev) => {
      showDialog(key, pin);
    });
    pinnedTabsList.appendChild(li);
  });
}

document.addEventListener('DOMContentLoaded', refreshPinnedTabs);

async function showDialog(key, pin) {
  document.getElementById('inputKey').value = key;
  document.getElementById('inputTitle').value = pin.title;
  document.getElementById('inputURL').value = pin.url;
  document.getElementById('inputURLPattern').value = pin.urlPattern;
  modal.show();
}

async function saveFromDialog() {
  await lpc('updatePin', {
    key: document.getElementById('inputKey').value,
    updates: {
      title: document.getElementById('inputTitle').value,
      url: document.getElementById('inputURL').value,
      urlPattern: document.getElementById('inputURLPattern').value,
    },
  });
  modal.hide();
  refreshPinnedTabs();
}

async function deleteFromDialog() {
  await lpc('removePin', {
    key: document.getElementById('inputKey').value,
  });
  modal.hide();
  refreshPinnedTabs();
}

document.addEventListener('DOMContentLoaded', () => {
  modal.init(saveFromDialog, deleteFromDialog);
});
