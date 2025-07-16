import { Server, UserException } from './lpc.js';
import { Cache } from './storage.js';

const GLOBAL_KEYSET_ID = 0;
const HISTORY_KEY = 'Backspace';

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
    if (options?.summon) {
      createOptions.windowId = currentTab.windowId;
      createOptions.index = currentTab.index + 1;
    } else {
      let window;
      try {
        window = await chrome.windows.get(pin.windowId)
      } catch (error) {
        window = await chrome.windows.getLastFocused();
      }
      createOptions.windowId = window.id;
    }
    pinnedTab = await chrome.tabs.create({
      url: pin.url,
      windowId: currentTab.windowId,
      ...createOptions,
    });
    pin.tabId = pinnedTab.id;
    pin.windowId = pinnedTab.windowId;
    pin.index = pinnedTab.index;
    keyset.set(key, pin);
  } else if (options?.reset) {
    await chrome.tabs.update(pinnedTab.id, { url: pin.url });
  }

  if (currentTab.id === pinnedTab.id) {
    return;
  }
  // If the tab should be "summoned", that means we should move it to the current location.
  if (options?.summon) {
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

  keysets.set({
    key: HISTORY_KEY,
    keysetId: GLOBAL_KEYSET_ID,
  }, createPin(currentTab));
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
  'pinTab': async (args) => {
    const [currentTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
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
    const dstRef = {
      ...srcRef,
      keysetId: args.updates.keysetId,
      key: args.updates.key,
    };
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
  'listPins': async (args) => {
    const keysetIds = args.withoutGlobal ? [args.keysetId] : [GLOBAL_KEYSET_ID, args.keysetId]
    const pins = await listPins(keysetIds);
    await cache.flush();
    return pins;
  },
});

chrome.runtime.onMessage.addListener(server.serve.bind(server));
