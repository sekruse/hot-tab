import { keyCodeToHTML, createIcon } from './keys.js';
import { Client } from './lpc.js';
import modal from './modal.js';
import toast from './toast.js';

const background = new Client(['listPins', 'updatePin', 'removePin']);

async function refreshPinnedTabs() {
  const pins = await background.listPins();
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
    li.appendChild(createIcon(pin, ['margin-left']));
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

document.addEventListener('DOMContentLoaded', toast.catch(refreshPinnedTabs));

async function showDialog(key, pin) {
  document.getElementById('inputKey').value = key;
  document.getElementById('inputTitle').value = pin.title;
  document.getElementById('inputURL').value = pin.url;
  document.getElementById('inputURLPattern').value = pin.urlPattern;
  modal.show();
}

async function saveFromDialog() {
  const key = document.getElementById('inputKey').value;
  await background.updatePin({
    key: key,
    updates: {
      title: document.getElementById('inputTitle').value,
      url: document.getElementById('inputURL').value,
      urlPattern: document.getElementById('inputURLPattern').value,
    },
  });
  modal.hide();
  toast.show(`Pin for ${key} updated.`, 3000);
  refreshPinnedTabs();
}

async function deleteFromDialog() {
  const key = document.getElementById('inputKey').value;
  await background.removePin({
    key: key,
  });
  modal.hide();
  toast.show(`Pin for ${key} removed.`, 3000);
  refreshPinnedTabs();
}

document.addEventListener('DOMContentLoaded', toast.catch(() => {
  modal.init(toast.catch(saveFromDialog), toast.catch(deleteFromDialog));
}));
