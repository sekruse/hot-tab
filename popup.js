import { GLOBAL_LAYER_ID, keysByKeyCode, isModifier, parseDigitKeycode } from './keys.js';
import { createIcon } from './ui-utils.js';
import combos from './combos.js';
import { Client } from './lpc.js';
import modal from './modal.js';
import toast from './toast.js';
import tooltip from './tooltip.js';

const background = new Client([
  'getState', 'setActiveLayerId',
  'getPin', 'listPins', 'getActiveKey', 'pinTab',
  'focusTab', 'focusNeighborTab', 'closeTab', 'closeTabs', 'closeUnpinnedTabs',
  'highlight', 'moveTab', 'moveWindows',
  'clearLayer', 'removePin',
  'updatePin',
  'toggleTabPinned',
  'getLayerConfig', 'setLayerConfig',
  'navigateHistory', 'getTabHistory',
]);

// Currently active layer ID.
let layerId;

/**
 * Refreshes the popup UI, including the layer name and the keyboard layout of pinned tabs.
 * @returns {Promise<void>}
 */
async function refreshPopup() {
  const state = await background.getState();
  layerId = state.layerId;

  const layerConfig = await background.getLayerConfig({ layerId, includeFallback: true });
  const nameInput = document.getElementById('layer-name');
  if (document.activeElement !== nameInput) {
    nameInput.value = layerConfig.name;
    nameInput.classList.toggle('layer-name-fallback', layerConfig.nameIsFallback);
  }

  document.querySelectorAll('#keyboard [data-keycode]').forEach((key) => {
    const keyCode = key.getAttribute('data-keycode');
    const digit = parseDigitKeycode(keyCode);
    if (!digit.exists) {
      key.innerHTML = '';
      key.removeAttribute('data-tooltip');
    } else {
      key.classList.toggle('key-highlighted', digit.value === layerId);
    }
    key.classList.remove('key-glow-blue');
  });
  const pins = await background.listPins({ layerId });
  pins.forEach(({ keyRef, pin }) => {
    const keyDiv = document.getElementById(`key${keyRef.key}`);
    if (!keyDiv) {
      throw new Error(`No keyDiv found for ${keyRef.key} / ${JSON.stringify(pin)}`);
    }
    keyDiv.setAttribute('data-tooltip', pin.title);
    keyDiv.replaceChildren(createIcon(pin));
  });

  const historyList = document.getElementById('history-list');
  const historyEntries = await background.getTabHistory();
  const { tabId: currentTabId } = await background.getActiveKey();
  historyList.innerHTML = '';
  if (historyEntries.length === 0) {
    return;
  }
  const entries = historyEntries.slice().reverse();
  for (let i = 0; i < entries.length; i++) {
    const pin = entries[i];
    const origIndex = historyEntries.length - 1 - i;
    const item = document.createElement('div');
    item.className = 'history-item';
    item.setAttribute('data-tooltip', pin.title);
    if (pin.tabId === currentTabId) {
      item.classList.add('history-item-current');
    }
    const icon = createIcon(pin);
    item.appendChild(icon);
    const title = document.createElement('span');
    title.className = 'history-title';
    title.textContent = pin.title.length > 25 ? pin.title.slice(0, 25) + '…' : pin.title;
    item.appendChild(title);
    item.addEventListener('click', toast.catch(async () => {
      await background.navigateHistory({ index: origIndex });
      window.close();
    }));
    historyList.appendChild(item);
  }
}

// Input handling
function withDefaultLayerId(keyRef) {
  if (keyRef.layerId == null) {
    // Provide the active layer ID as a fallback value when the key ref doesn't specify one explicitly.
    return {
      layerId: layerId,
      key: keyRef.key,
    };
  }
  return keyRef;
}

const comboTrie = function () {
  const buildAction = function (descriptor) {
    return async function (parsedArgs) {
      const args = descriptor.argTransformer(parsedArgs, withDefaultLayerId);
      await background[descriptor.method](args);
      if (descriptor.closePopup) {
        window.close();
      } else {
        refreshPopup();
      }
    }
  };
  const trie = combos.createDefaultTrie(buildAction);
  trie.addCombo('z', async () => {
    const { keyRef } = await background.getActiveKey();
    if (!keyRef) {
      throw new Error('Current tab is not pinned.');
    }
    if (keyRef.layerId !== GLOBAL_LAYER_ID) {
      layerId = keyRef.layerId;
      // No need to wait: We have the cached value already updated.
      background.setActiveLayerId({ layerId });
    }
    await refreshPopup();
    const keyDiv = document.getElementById(`key${keyRef.key}`);
    keyDiv.classList.add('key-glow-blue');
  });
  trie.addCombo('e@', async ([keyRef]) => {
    keyRef = withDefaultLayerId(keyRef);
    const { ref: actualRef, pin } = await background.getPin(keyRef);
    showDialog(actualRef.key, actualRef.layerId, pin);
  });
  trie.addCombo('ln', () => {
    document.getElementById('layer-name').focus();
  });
  trie.addCombo(',', () => chrome.runtime.openOptionsPage());
  trie.addCombo('q', () => window.close());
  return trie;
}();

async function handleDirectInput(keyCode) {
  if (!keysByKeyCode.has(keyCode)) {
    return;
  }
  const digit = parseDigitKeycode(keyCode);
  if (digit.exists) {
    await background.setActiveLayerId({ layerId: digit.value });
    layerId = digit.value;
    await refreshPopup();
    return;
  }
  if (keyCode === 'Backspace' && event.ctrlKey) {
    // Pinning the Backspace key manually is not allowed. It's reserved for jumping back.
    return;
  }
  if (event.ctrlKey) {
    await background.pinTab({ key: keyCode, layerId: layerId, options: { pinScope: 'page' } });
  } else if (event.shiftKey) {
    await background.focusTab({ key: keyCode, layerId: layerId, options: { summon: true } });
  } else if (event.altKey) {
    await background.removePin({ key: keyCode, layerId: layerId });
    toast.show(`Pin for ${keyCode} removed.`, 3000);
    await refreshPopup();
    return;
  } else {
    await background.focusTab({ key: keyCode, layerId: layerId });
  }
  window.close();
}

// If not null, inputSequence collects key presses.
let inputSequence;
function addInputListeners() {
  document.querySelectorAll('[data-keycode]').forEach((key) => {
    key.addEventListener('click', toast.catch(async (event) => {
      const keyCode = event.currentTarget.getAttribute('data-keycode');
      await handleDirectInput(keyCode);
    }));
  });

  const nameInput = document.getElementById('layer-name');
  nameInput.addEventListener('focus', () => {
    if (nameInput.classList.contains('layer-name-fallback')) {
      nameInput.value = '';
      nameInput.classList.remove('layer-name-fallback');
    }
  });
  nameInput.addEventListener('blur', toast.catch(async () => {
    const config = await background.getLayerConfig({ layerId });
    const newName = nameInput.value.trim();
    if (newName !== config.name) {
      await background.setLayerConfig({ layerId, config: { name: newName } });
    }
    await refreshPopup();
  }));
  nameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      nameInput.blur();
    } else if (event.key === 'Escape') {
      nameInput.value = ''; // Force refresh in blur
      nameInput.blur();
    }
    event.stopPropagation();
  });

  document.addEventListener('keydown', toast.catch(async (event) => {
    if (modal.isVisible() || document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') {
      return;
    }
    const commandBar = document.getElementById('command-bar');
    try {
      if (event.code === 'Space') {
        // Make the input sequence non-null to start a new input sequence.
        inputSequence = '';
        event.preventDefault();
      } else if (inputSequence != null) {
        if (isModifier(event.code)) {
          return;
        }
        event.preventDefault();
        inputSequence += event.key;
        // Hand through input to the direct handler to switch the active layer.
        if (event.code.startsWith('Digit')) {
          handleDirectInput(event.code);
        }
        try {
          const result = comboTrie.match(inputSequence);
          if (result) {
            await result.action(result.args);
            inputSequence = null;
          }
        } catch (err) {
          inputSequence = null;
          throw err;
        }
      } else {
        await handleDirectInput(event.code);
      }
    } finally {
      commandBar.classList.toggle('hidden', inputSequence == null);
      commandBar.innerText = `> ${inputSequence}`;
    }
  }));
}

// Modal handling
async function showDialog(key, layerId, pin) {
  document.getElementById('modal-title').innerText = `Edit Pin at ${key} in Layer ${layerId}`;
  document.getElementById('inputKey').value = key;
  document.getElementById('inputLayerId').value = layerId;
  document.getElementById('inputTitle').value = pin.title;
  document.getElementById('inputURL').value = pin.url;
  document.getElementById('inputURLPattern').value = pin.urlPattern;
  modal.show();
}

async function saveFromDialog() {
  const key = document.getElementById('inputKey').value;
  const layerId = document.getElementById('inputLayerId').value;
  await background.updatePin({
    key: key,
    layerId: layerId,
    updates: {
      title: document.getElementById('inputTitle').value,
      url: document.getElementById('inputURL').value,
      urlPattern: document.getElementById('inputURLPattern').value,
    },
  });
  modal.hide();
  toast.show(`Pin for ${key} updated in layer ${layerId}.`, 3000);
  refreshPopup();
}

document.addEventListener('DOMContentLoaded', () => {
  toast.init();
  toast.catch(async () => {
    const state = await background.getState();
    layerId = state.layerId;
    tooltip.init();
    addInputListeners();
    await refreshPopup();
    modal.init(toast.catch(saveFromDialog));
    ['inputTitle', 'inputURL', 'inputURLPattern'].forEach(id => {
      document.getElementById(id).addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          toast.catch(saveFromDialog)();
        } else if (event.key === 'Escape') {
          modal.hide();
        }
      });
    });
  })();
});

