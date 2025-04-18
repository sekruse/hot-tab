const codeSymbols = (() => {
  const cs = new Map();
  cs.set('Minus', '-');
  cs.set('Equal', '=');
  cs.set('LeftBracket', '[');
  cs.set('RightBracket', ']');
  cs.set('Backslash', '\\');
  cs.set('Backspace', '&#9003;');
  cs.set('Semicolon', ';');
  cs.set('Quote', "'");
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach((ch) => cs.set(`Key${ch}`, ch));
  '1234567890'.split('').forEach((d) => cs.set(`Digit${d}`, d));
  return cs;
})();

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
    keySpan.innerHTML = codeSymbols.get(key);
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
  if (!codeSymbols.has(event.code)) {
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

