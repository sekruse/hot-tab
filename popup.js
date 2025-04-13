document.addEventListener('keydown', async (event) => {
  if (!/^Key[A-Z0-9]$/.test(event.code)) {
    return;
  }
  if (event.ctrlKey) {
    await chrome.runtime.sendMessage({ command: 'pinTab', args: { key: event.code } });
  } else if (event.shiftKey) {
    await chrome.runtime.sendMessage({ command: 'summonTab', args: { key: event.code } });
  } else {
    await chrome.runtime.sendMessage({ command: 'focusTab', args: { key: event.code } });
  }
  window.close();
});

document.addEventListener('DOMContentLoaded', async () => {
  const result = await chrome.runtime.sendMessage({ command: 'listPins' });
  if (!result.success) {
    throw new Error(result.errorMessage);
  }
  const pins = result.result;
  const pinnedTabsList = document.getElementById('pinnedTabsList');
  Object.keys(pins).sort().forEach((key) => {
    const pin = pins[key];
    const li = document.createElement('li');
    li.classList.add('flex', 'flex-row');
    const keySpan = document.createElement('span');
    keySpan.classList.add('key');
    keySpan.innerText = key.replace('Key', '');
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
});
