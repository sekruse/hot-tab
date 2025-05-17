import { keyCodeToHTML } from './keys.js';

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
    li.classList.add('flex', 'flex-row');
    const keySpan = document.createElement('span');
    keySpan.classList.add('key', 'key-inline');
    keySpan.innerHTML = keyCodeToHTML.get(key);
    li.appendChild(keySpan);
    if (pin.favIconUrl) {
      const icon = document.createElement('img');
      icon.classList.add('icon', 'margin-left');
      icon.setAttribute('src', pin.favIconUrl)
      li.appendChild(icon);
    };
    const title = document.createElement('span');
    title.classList.add('margin-left');
    title.innerText = pin.title;
    li.appendChild(title);
    pinnedTabsList.appendChild(li);
  });
}

document.addEventListener('DOMContentLoaded', refreshPinnedTabs);
