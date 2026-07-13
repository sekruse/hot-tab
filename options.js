import { Client } from './lpc.js';
import toast from './toast.js';

const background = new Client([
  'listCommandCombos', 'setCommandCombo',
  'getKeyOrder', 'setKeyOrder',
  'listUrlPatterns', 'addUrlPattern', 'removeUrlPattern',
]);

async function refreshKeyOrder() {
  const orderInput = document.getElementById('orderInput');
  const keyOrder = await background.getKeyOrder();
  orderInput.value = keyOrder.map((key) => key.inputChar).join('');
}

async function refreshShortcuts() {
  const shortcutGrid = document.getElementById('shortcutGrid');
  const commands = await chrome.commands.getAll();
  const combos = await background.listCommandCombos();
  commands
    .filter(c => c.name.match(/^command-\d{2}$/))
    .sort((a, b) => a.description.localeCompare(b.description))
    .forEach((c) => {
      // Add name.
      const title = document.createElement('span');
      title.innerText = c.description;
      shortcutGrid.appendChild(title);
      // Add shortcut.
      const shortcutDiv = document.createElement('div');
      if (c.shortcut) {
        // The shortcut string is platform dependent: ⌃⇧Y vs Ctrl+Shift+Y
        const keys = c.shortcut.includes('+') ? c.shortcut.split('+') : c.shortcut.split('');
        for (let i = 0; i < keys.length; i++) {
          const keySpan = document.createElement('span');
          keySpan.classList.add('key', 'key-inline');
          keySpan.classList.toggle('margin-left', i > 0);
          keySpan.innerText = keys[i];
          shortcutDiv.appendChild(keySpan);
        }
      } else {
        const keySpan = document.createElement('span');
        keySpan.innerText = '(no shortcut)';
        shortcutDiv.appendChild(keySpan);
      }
      shortcutGrid.appendChild(shortcutDiv);
      // Add key combo.
      const comboInput = document.createElement('input');
      comboInput.classList.add('font-monospace');
      comboInput.type = 'text';
      comboInput.value = combos[c.name];
      comboInput.addEventListener('input', toast.catch(async (event) => {
        return background.setCommandCombo({
          command: c.name,
          combo: event.target.value,
        });
      }));
      shortcutGrid.appendChild(comboInput);
    });
}

async function refreshUrlPatterns() {
  const list = document.getElementById('urlPatternsList');
  list.innerHTML = '';
  const patterns = await background.listUrlPatterns();
  if (patterns.length === 0) {
    const emptyMsg = document.createElement('p');
    emptyMsg.classList.add('margin-bottom');
    emptyMsg.innerText = 'No URL patterns configured. Add one below to pin tabs with dynamic paths.';
    list.appendChild(emptyMsg);
    return;
  }
  patterns.forEach((pattern, index) => {
    const item = document.createElement('div');
    item.classList.add('url-pattern-item');
    const span = document.createElement('span');
    span.innerText = pattern;
    item.appendChild(span);
    const removeBtn = document.createElement('button');
    removeBtn.classList.add('url-pattern-remove');
    removeBtn.innerText = '\u00D7';
    removeBtn.title = 'Remove pattern';
    removeBtn.addEventListener('click', toast.catch(async () => {
      await background.removeUrlPattern({ index });
      await refreshUrlPatterns();
    }));
    item.appendChild(removeBtn);
    list.appendChild(item);
  });
}

document.addEventListener('DOMContentLoaded', toast.catch(async () => {
  await refreshKeyOrder();
  await refreshShortcuts();
  await refreshUrlPatterns();

  const orderInput = document.getElementById('orderInput');
  orderInput.addEventListener('input', toast.catch(async (event) => {
    await background.setKeyOrder({ inputChars: event.target.value });
    await refreshKeyOrder();
  }));

  const urlPatternInput = document.getElementById('urlPatternInput');
  const addUrlPatternBtn = document.getElementById('addUrlPatternBtn');
  addUrlPatternBtn.addEventListener('click', toast.catch(async () => {
    const pattern = urlPatternInput.value.trim();
    if (!pattern) return;
    await background.addUrlPattern({ pattern });
    urlPatternInput.value = '';
    await refreshUrlPatterns();
  }));
  urlPatternInput.addEventListener('keydown', toast.catch(async (event) => {
    if (event.key === 'Enter') {
      const pattern = urlPatternInput.value.trim();
      if (!pattern) return;
      await background.addUrlPattern({ pattern });
      urlPatternInput.value = '';
      await refreshUrlPatterns();
    }
  }));
}));
