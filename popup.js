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
    li.innerText = `${key}: ${pin.title}`;
    pinnedTabsList.appendChild(li);
  });
});
