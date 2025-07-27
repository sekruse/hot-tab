import { Server, UserException } from './lpc.js';
import { Cache } from './storage.js';
import combos from './combos.js';
import { KEYSET_IDS, GLOBAL_KEYSET_ID, HISTORY_KEY } from './keys.js';

const cache = new Cache();

async function findTab(pin, keyRef) {
  // First, try to retrieve the pinned tab.
  if (pin.tabId !== undefined) {
    try {
      return await chrome.tabs.get(pin.tabId);
    } catch (error) {
      console.log(`Tab for ${pin.title} not found: ${error}`);
    }
  }
  // Otherwise, try to find a tab that matches the URL pattern.
  const tabs = await chrome.tabs.query({ url: pin.urlPattern });
  console.log(`Found ${tabs.length} tabs matching ${pin.urlPattern }`);
  if (tabs.length > 0) {
    const tab = tabs[0];
    pin = {
      ...createPin(tab),
      title: pin.title,
      favIconUrl: pin.favIconUrl,
      url: pin.url,
      urlPattern: pin.urlPattern,
    };
    const keysets = await cache.getKeysets();
    keysets.set(keyRef, pin);
    return tab;
  }
  // If none, mark the pin as dangling.
  delete pin.tabId;
  const keysets = await cache.getKeysets();
  keysets.set(keyRef, pin);
  return null;
}

async function listPins(keysetIds) {
  const keysets = await cache.getKeysets();
  const keyset = keysets.getView(keysetIds);
  const refreshedPins = await Promise.all(keyset.listEntries().map(async (entry) => {
    await findTab(entry.value, entry.keyRef);
    return { keyRef: entry.keyRef, pin: entry.value }; 
  }));
  return refreshedPins.reduce((acc, val) => {
    acc[val.keyRef.key] = val.pin;
    return acc;
  }, {});
}


function createPin(tab, options) {
  const url = new URL(tab.url);
  let urlPattern;
  if (options?.pinScope === 'origin') {
    urlPattern = `${url.origin}/*`;
  } else {
    urlPattern = `${url.origin}${url.pathname}`;
  }
  let pin = {
    tabId: tab.id,
    windowId: tab.windowId,
    index: tab.index,
    title: tab.title,
    url: tab.url,
    urlPattern: urlPattern,
    favIconUrl: tab.favIconUrl,
  };
  return pin;
}

// Bring a pinned tab to the focus, possibly shifting focus to its window.
async function focusTab(key, keysetId, options) {
  const keysets = await cache.getKeysets();
  const keyset = keysets.getView([GLOBAL_KEYSET_ID, keysetId]);
  const pin = keyset.get(key);
  if (!pin) {
    throw new UserException(`There is no pin at ${key} in keyset ${keysetId}.`);
  }
  let pinnedTab = await findTab(pin, { key, keysetId });
  const [currentTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });

  if (pinnedTab === null || options?.recreate) {
    const createOptions = {};
    if (options?.summon && currentTab) {
      createOptions.windowId = currentTab.windowId;
      createOptions.index = currentTab.index + 1;
    } else {
      let window;
      try {
        window = await chrome.windows.get(pin.windowId)
      } catch (error) {
        try {
          window = await chrome.windows.getLastFocused();
        } catch (anotherError) {
          // When triggered via shortcuts, there might be no window at all.
          window = await chrome.windows.create({
            type: 'normal',
            focused: true,
          });
        }
      }
      createOptions.windowId = window.id;
    }
    pinnedTab = await chrome.tabs.create({
      url: pin.url,
      windowId: currentTab?.windowId,
      ...createOptions,
    });
    pin.tabId = pinnedTab.id;
    pin.windowId = pinnedTab.windowId;
    pin.index = pinnedTab.index;
    keyset.set(key, pin);
  } else if (options?.reset) {
    await chrome.tabs.update(pinnedTab.id, { url: pin.url });
  }

  // If the tab should be "summoned", that means we should move it to the current location.
  if (options?.summon && currentTab) {
    if ((currentTab.windowId !== pinnedTab.windowId) || (Math.abs(currentTab.index - pinnedTab.index) > 1)) {
      pinnedTab = await chrome.tabs.move(pinnedTab.id, {
        index: currentTab.index + 1,
        windowId: currentTab.windowId,
      });
    }
  }
  if (!pinnedTab.active) {
    pinnedTab = await chrome.tabs.update(pinnedTab.id, { active: true });
  }
  await chrome.windows.update(pinnedTab.windowId, { focused: true });

  if (currentTab) {
    keysets.set({
      key: HISTORY_KEY,
      keysetId: GLOBAL_KEYSET_ID,
    }, createPin(currentTab));
  }
}

async function closeTab(key, keysetId) {
  const keysets = await cache.getKeysets();
  const keyset = keysets.getView([GLOBAL_KEYSET_ID, keysetId]);
  const pin = keyset.get(key);
  if (!pin) {
    throw new UserException(`There is no pin at ${key} in keyset ${keysetId}.`);
  }
  const pinnedTab = await findTab(pin, { key, keysetId });
  if (!pinnedTab) {
    return;
  }
  await chrome.tabs.remove(pinnedTab.id);
}

const server = new Server({
  'getState': async (args) => {
    const state = await cache.getState();
    return state.data;
  },
  'setActiveKeysetId': async (args) => {
    const state = await cache.getState();
    state.setKeysetId(args.keysetId);
    await cache.flush();
  },
  'listCommandCombos': async (args) => {
    const options = await cache.getOptions();
    return options.listCommandCombos();
  },
  'setCommandCombo': async (args) => {
    const options = await cache.getOptions();
    options.setCommandCombo(args.command, args.combo);
  },
  'pinTab': async (args) => {
    const [currentTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!currentTab) {
      throw new UserException(`There is no active tab to be pinned.`);
    }
    const keysets = await cache.getKeysets();
    const keyset = keysets.getView([GLOBAL_KEYSET_ID, args.keysetId]);
    const pin = createPin(currentTab, args.options);
    const keysetId = keyset.set(args.key, pin);
    await cache.flush();
    return { keysetId };
  },
  'updatePin': async (args) => {
    const keysets = await cache.getKeysets();
    const srcRef = {
      keysetId: args.keysetId,
      key: args.key,
    };
    const dstRef = { ...srcRef };
    if (args.updates.keysetId != null) {
      dstRef.keysetId = args.updates.keysetId;
    }
    if (args.updates.key != null) {
      dstRef.key = args.updates.key;
    }
    const pin = keysets.get(srcRef);
    ['title', 'url', 'urlPattern'].forEach(p => {
      if (p in args.updates) {
        pin[p] = args.updates[p];
      }
    });
    if (srcRef.keysetId !== dstRef.keysetId || srcRef.key !== dstRef.key) {
      keysets.remove(srcRef);
    }
    keysets.set(dstRef, pin);
    await cache.flush();
  },
  'clearKeyset': async (args) => {
    const keysets = await cache.getKeysets();
    const keyset = keysets.getView([args.keysetId]);
    keyset.listEntries().forEach((e) => keyset.remove(e.keyRef.key));
    await cache.flush();
  },
  'removePin': async (args) => {
    const keysets = await cache.getKeysets();
    const keyset = keysets.getView([GLOBAL_KEYSET_ID, args.keysetId]);
    const keysetId = keyset.remove(args.key);
    await cache.flush();
    return { keysetId };
  },
  'focusTab': async (args) => {
    await focusTab(args.key, args.keysetId, args.options);
    await cache.flush();
  },
  'closeTab': async (args) => {
    await closeTab(args.key, args.keysetId);
    await cache.flush();
  },
  'listPins': async (args) => {
    const keysetIds = args.withoutGlobal ? [args.keysetId] : [GLOBAL_KEYSET_ID, args.keysetId]
    const pins = await listPins(keysetIds);
    await cache.flush();
    return pins;
  },
  'getActiveKey': async (args) => {
    const [currentTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!currentTab) {
      throw new UserException('There is no active tab.');
    }
    for (let i = 0; i < KEYSET_IDS.length; i++) {
      const keysetId = KEYSET_IDS[i];
      const pins = await listPins([keysetId]);
      const keys = Object.keys(pins);
      for (let j = 0; j < keys.length; j++) {
        const key = keys[j];
        if (key === HISTORY_KEY) {
          continue;
        }
        const pin = pins[key];
        if (pin.tabId === currentTab.id) {
          return { key, keysetId };
        }
      }
    }
    throw new UserException(`No pin found for current tab "${currentTab.title}" (${currentTab.url}).`);
  },
});

chrome.runtime.onMessage.addListener(server.serve.bind(server));

const comboTrie = function() {
  const buildAction = function(descriptor) {
    return async function(parsedArgs) {
      const state = await cache.getState();
      const withDefaultKeysetId = function(keyRef) {
        if (keyRef.keysetId == null) {
          return {
            keysetId: state.data.keysetId,
            key: keyRef.key,
          };
        }
        return keyRef;
      };
      const args = descriptor.argTransformer(parsedArgs, withDefaultKeysetId);
      await server.execute({
        command: descriptor.method,
        args: args,
      });
    };
  };
  return combos.createDefaultTrie(buildAction);
}();

chrome.commands.onCommand.addListener(async (command) => {
  console.log(`Command triggered: ${command}`);
  const options = await cache.getOptions();
  const combo = options.getCommandCombo(command);
  if (!combo) {
    console.log(`No key sequence registered for ${command}.`);
    return;
  }
  const result = comboTrie.match(combo);
  if (result) {
    await result.action(result.args);
  }
});
