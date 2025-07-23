import { keyCodeToHTML, isModifier, createIcon, parseDigitKeycode, ComboTrie } from './keys.js';
import { Client } from './lpc.js';
import toast from './toast.js';
import tooltip from './tooltip.js';

const background = new Client([
  'getState', 'setActiveKeysetId',
  'listPins', 'pinTab',
  'focusTab', 'closeTab',
  'clearKeyset', 'removePin',
  'updatePin']);

// Currently active keyset ID.
let keysetId;

// Provides the active keyset ID as a fallback value when the key ref doesn't specify one explicitly.
function withDefaultKeysetId(keyRef) {
  if (keyRef.keysetId == null) {
    return {
      keysetId: keysetId,
      key: keyRef.key,
    };
  }
  return keyRef;
}

const combos = new ComboTrie();
combos.addCombo('g@', async (keyRef) => {
  await background.focusTab(withDefaultKeysetId(keyRef));
  window.close();
});
combos.addCombo('G@', async (keyRef) => {
  await background.focusTab({ ...withDefaultKeysetId(keyRef), options: { summon: true }});
  window.close();
});
combos.addCombo('f@', async (keyRef) => {
  await background.focusTab({ ...withDefaultKeysetId(keyRef), options: { recreate: true }});
  window.close();
});
combos.addCombo('r@', async (keyRef) => {
  await background.focusTab({ ...withDefaultKeysetId(keyRef), options: { reset: true }});
  window.close();
});
combos.addCombo('x@', async (keyRef) => {
  await background.closeTab({ ...withDefaultKeysetId(keyRef), options: { reset: true }});
  refreshPinnedTabs();
});
combos.addCombo('m@@', async (srcKeyRef, dstKeyRef) => {
  await background.updatePin({
    ...withDefaultKeysetId(srcKeyRef),
    updates: withDefaultKeysetId(dstKeyRef),
  });
  refreshPinnedTabs();
});
combos.addCombo('d@', async (keyRef) => {
  await background.removePin(withDefaultKeysetId(keyRef));
  refreshPinnedTabs();
});
combos.addCombo('D#', async (partialKeyRef) => {
  await background.clearKeyset(partialKeyRef);
  refreshPinnedTabs();
});
combos.addCombo('DD', async () => {
  await background.clearKeyset({ keysetId });
  refreshPinnedTabs();
});
combos.addCombo('p@', async (keyRef) => {
  await background.pinTab({ ...withDefaultKeysetId(keyRef), options: { pinScope: 'origin' }});
  window.close();
});
combos.addCombo('P@', async (keyRef) => {
  await background.pinTab({ ...withDefaultKeysetId(keyRef), options: { pinScope: 'page' }});
  window.close();
});
combos.addCombo('q', () => window.close());
combos.addCombo('e', async () => {
  const w = await chrome.windows.get(chrome.windows.WINDOW_ID_CURRENT);
  await chrome.sidePanel.open({ windowId: w.id });
  window.close();
});

async function refreshPinnedTabs() {
  const pins = await background.listPins({ keysetId: keysetId });
  document.querySelectorAll('#keyboard [data-keycode]').forEach((key) => {
    const keyCode = key.getAttribute('data-keycode');
    const digit = parseDigitKeycode(keyCode);
    if (!digit.exists) {
      key.innerHTML = '';
      key.removeAttribute('data-tooltip');
    } else {
      key.classList.toggle('key-highlighted', digit.value === keysetId);
    }
  });
  Object.keys(pins).forEach((key) => {
    const pin = pins[key];
    const keyDiv = document.getElementById(`key${key}`);
    if (!keyDiv) {
      throw new Error(`No keyDiv found for ${key} / ${JSON.stringify(pin)}`);
    }
    keyDiv.setAttribute('data-tooltip', pin.title);
    keyDiv.replaceChildren(createIcon(pin));
  });
}

async function handleDirectInput(keyCode) {
  if (!keyCodeToHTML.has(keyCode)) {
    return;
  }
  const digit = parseDigitKeycode(keyCode);
  if (digit.exists) {
    await background.setActiveKeysetId({ keysetId: digit.value });
    keysetId = digit.value;
    await refreshPinnedTabs();
    return;
  }
  if (keyCode === 'Backspace' && event.ctrlKey) {
    // Pinning the Backspace key manually is not allowed. It's reserved for jumping back.
    return;
  }
  if (event.ctrlKey) {
    await background.pinTab({ key: keyCode, keysetId: keysetId, options: { pinScope: 'origin' }});
  } else if (event.shiftKey) {
    await background.focusTab({ key: keyCode, keysetId: keysetId, options: { summon: true }});
  } else if (event.altKey) {
    await background.removePin({ key: keyCode, keysetId: keysetId });
    toast.show(`Pin for ${keyCode} removed.`, 3000);
    await refreshPinnedTabs();
    return;
  } else {
    await background.focusTab({ key: keyCode, keysetId: keysetId });
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
    if (event.code === 'Space') {
      // Make the input sequence non-null to start a new input sequence.
      inputSequence = '';
      return;
    }
    if (inputSequence != null) {
      if (isModifier(event.code)) {
        return;
      }
      inputSequence += event.key;
      // Hand through input to the direct handler to switch the active keyset.
      if (event.code.startsWith('Digit')) {
        handleDirectInput(event.code);
      }
      try {
        const result = combos.match(inputSequence);
        if (result) {
          await result.action(result.args[0], result.args[1]);
          inputSequence = null;
        }
      } catch (err) {
        inputSequence = null;
        throw err;
      }
      return;
    }
    await handleDirectInput(event.code);
  }));
}


document.addEventListener('DOMContentLoaded', () => {
  toast.init();
  toast.catch(async () => {
    const state = await background.getState();
    keysetId = state.keysetId;
    tooltip.init();
    addInputListeners();
    await refreshPinnedTabs();
  })();
});


