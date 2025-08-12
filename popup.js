import { GLOBAL_LAYER_ID, keysByKeyCode, isModifier, createIcon, parseDigitKeycode } from './keys.js';
import combos from './combos.js';
import { Client } from './lpc.js';
import modal from './modal.js';
import toast from './toast.js';
import tooltip from './tooltip.js';

const background = new Client([
  'getState', 'setActiveLayerId',
  'getPin', 'listPins', 'getActiveKey', 'pinTab',
  'focusTab', 'closeTab', 'closeTabs', 'closeUnpinnedTabs',
  'clearLayer', 'removePin',
  'updatePin',
  'toggleTabPinned',
]);

// Currently active layer ID.
let layerId;

async function refreshPinnedTabs() {
  const state = await background.getState();
  layerId = state.layerId;
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
  const entries = await background.listPins({ layerId });
  entries.forEach(({keyRef, pin}) => {
    const keyDiv = document.getElementById(`key${keyRef.key}`);
    if (!keyDiv) {
      throw new Error(`No keyDiv found for ${keyRef.key} / ${JSON.stringify(pin)}`);
    }
    keyDiv.setAttribute('data-tooltip', pin.title);
    keyDiv.replaceChildren(createIcon(pin));
  });
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

const comboTrie = function() {
  const buildAction = function(descriptor) {
    return async function(parsedArgs) {
      const args = descriptor.argTransformer(parsedArgs, withDefaultLayerId);
      await background[descriptor.method](args);
      if (descriptor.closePopup) {
        window.close();
      } else {
        refreshPinnedTabs();
      }
    }
  };
  const trie = combos.createDefaultTrie(buildAction);
  trie.addCombo('z', async () => {
    const keyRef = await background.getActiveKey();
    if (keyRef.layerId !== GLOBAL_LAYER_ID) {
      layerId = keyRef.layerId;
      // No need to wait: We have the cached value already updated.
      background.setActiveLayerId({ layerId });
    }
    await refreshPinnedTabs();
    const keyDiv = document.getElementById(`key${keyRef.key}`);
    keyDiv.classList.add('key-glow-blue');
  });
  trie.addCombo('e@', async ([keyRef]) => {
    keyRef = withDefaultLayerId(keyRef);
    const { ref: actualRef, pin } = await background.getPin(keyRef);
    showDialog(actualRef.key, actualRef.layerId, pin);
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
    await refreshPinnedTabs();
    return;
  }
  if (keyCode === 'Backspace' && event.ctrlKey) {
    // Pinning the Backspace key manually is not allowed. It's reserved for jumping back.
    return;
  }
  if (event.ctrlKey) {
    await background.pinTab({ key: keyCode, layerId: layerId, options: { pinScope: 'origin' } });
  } else if (event.shiftKey) {
    await background.focusTab({ key: keyCode, layerId: layerId, options: { summon: true } });
  } else if (event.altKey) {
    await background.removePin({ key: keyCode, layerId: layerId });
    toast.show(`Pin for ${keyCode} removed.`, 3000);
    await refreshPinnedTabs();
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
  document.addEventListener('keydown', toast.catch(async (event) => {
    if (modal.isVisible()) {
      return;
    }
    const commandBar = document.getElementById('command-bar');
    try {
      if (event.code === 'Space') {
        // Make the input sequence non-null to start a new input sequence.
        inputSequence = '';
      } else if (inputSequence != null) {
        if (isModifier(event.code)) {
          return;
        }
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
  refreshPinnedTabs();
}

document.addEventListener('DOMContentLoaded', () => {
  toast.init();
  toast.catch(async () => {
    const state = await background.getState();
    layerId = state.layerId;
    tooltip.init();
    addInputListeners();
    await refreshPinnedTabs();
    modal.init(toast.catch(saveFromDialog));
  })();
});

