function getSymbolForKeycode(key) {
  if (key.startsWith('Key')) {
    return key.replace('Key', '');
  }
  if (key === 'Backspace') {
    return '&#9003;';
  }
  return key
}

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
    keySpan.classList.add('key');
    keySpan.innerHTML = getSymbolForKeycode(key);
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

document.addEventListener('keydown', async (event) => {
  if (/^Key[A-Z]$/.test(event.code) || event.code === 'Backspace') {
    if (event.ctrlKey) {
      if (event.code === 'Backspace') {
        // Pinning the Backspace key manually is not allowed. It's reserved for jumping back.
        return;
      }
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
  } else {
    return;
  }
  window.close();
});

