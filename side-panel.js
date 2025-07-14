import { keyCodeToHTML, createIcon, parseDigitKeycode } from './keys.js';
import { Client } from './lpc.js';
import modal from './modal.js';
import toast from './toast.js';

const background = new Client(['getState', 'setActiveKeysetId', 'listPins', 'updatePin', 'removePin']);

async function refreshPinnedTabs() {
  for (let keysetId = 0; keysetId < 10; keysetId++) {
    const pins = await background.listPins({ keysetId, withoutGlobal: true });
    const pinnedTabsList = document.getElementById(`pinnedTabsList${keysetId}`);
    pinnedTabsList.innerHTML = '';
    Object.keys(pins).sort().forEach((key) => {
      const pin = pins[key];
      const li = document.createElement('li');
      li.classList.add('tab', 'flex', 'flex-row');
      const keySpan = document.createElement('span');
      keySpan.classList.add('key', 'key-inline');
      keySpan.innerHTML = keyCodeToHTML.get(key);
      li.appendChild(keySpan);
      li.appendChild(createIcon(pin, ['margin-left']));
      const title = document.createElement('span');
      title.classList.add('margin-left');
      title.innerText = pin.title;
      li.appendChild(title);
      li.addEventListener('click', (ev) => {
        showDialog(key, keysetId, pin);
      });
      pinnedTabsList.appendChild(li);
    });
  }
}

document.addEventListener('DOMContentLoaded', toast.catch(refreshPinnedTabs));
document.addEventListener('keydown', toast.catch(async (event) => {
  const digit = parseDigitKeycode(event.code);
  if (digit.exists) {
    await background.setActiveKeysetId({ keysetId: digit.value });
    await refreshPinnedTabs();
  }
}));

async function showDialog(key, keysetId, pin) {
  document.getElementById('inputKey').value = key;
  document.getElementById('inputKeysetId').value = keysetId;
  document.getElementById('inputTitle').value = pin.title;
  document.getElementById('inputURL').value = pin.url;
  document.getElementById('inputURLPattern').value = pin.urlPattern;
  modal.show();
}

async function saveFromDialog() {
  const key = document.getElementById('inputKey').value;
  const keysetId = document.getElementById('inputKeysetId').value;
  await background.updatePin({
    key: key,
    keysetId: keysetId,
    updates: {
      title: document.getElementById('inputTitle').value,
      url: document.getElementById('inputURL').value,
      urlPattern: document.getElementById('inputURLPattern').value,
    },
  });
  modal.hide();
  toast.show(`Pin for ${key} updated in keyset ${keysetId}.`, 3000);
  refreshPinnedTabs();
}

async function deleteFromDialog() {
  const key = document.getElementById('inputKey').value;
  const keysetId = document.getElementById('inputKeysetId').value;
  await background.removePin({
    key: key,
    keysetId: keysetId,
  });
  modal.hide();
  toast.show(`Pin for ${key} removed from keyset ${keysetId}.`, 3000);
  refreshPinnedTabs();
}

document.addEventListener('DOMContentLoaded', toast.catch(() => {
  modal.init(toast.catch(saveFromDialog), toast.catch(deleteFromDialog));
}));
