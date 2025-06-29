import { Server, UserException } from './lpc.js';
import { Cache } from './storage.js';

const GLOBAL_KEYSET_ID = 0;
const HISTORY_KEY = 'Backspace';

const cache = new Cache();

async function updatePin(key, keysetId, updates) {
  const keysets = await cache.getKeysets();
  const pin = keysets.get(keysetId, key);
  ['title', 'url', 'urlPattern'].forEach(p => {
    if (p in updates) {
      pin[p] = updates[p];
    }
  });
  if (('key' in updates && updates.key !== key) || ('keysetId' in updates && updates.keysetId != keysetId)) {
    keysets.remove(keysetId, key);
  }
  keysets.set(updates.keysetId || keysetId, updates.key || key, pin);
}

async function findTab(pin, key, keysetId) {
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
    await pinTab(key, keysetId, tab, {
      title: pin.title,
      favIconUrl: pin.favIconUrl,
      url: pin.url,
      urlPattern: pin.urlPattern,
    });
    return tab;
  }
  // If none, mark the pin as dangling.
  delete pin.tabId;
  const keysets = await cache.getKeysets();
  keysets.set(keysetId, key, pin);
  return null;
}

async function listPins(keysetId) {
  const keysets = await cache.getKeysets();
  const refreshedPins = await Promise.all(keysets.getKeys(keysetId).map(async (key) => {
    const pin = keysets.get(keysetId, key);
    await findTab(pin, key, keysetId);
    return { key, pin }; 
  }));
  return refreshedPins.reduce((acc, val) => {
    acc[val.key] = val.pin;
    return acc;
  }, {});
}


// Pin a tab to a certain key, so that it can be focused or summoned later.
async function pinTab(key, keysetId, tab, overrides) {
  const keysets = await cache.getKeysets();
  let pin = {
    tabId: tab.id,
    windowId: tab.windowId,
    index: tab.index,
    title: tab.title,
    url: tab.url,
    urlPattern: tab.url,
    favIconUrl: tab.favIconUrl,
  };
  if (overrides) {
    pin = {...pin, ...overrides};
  }
  keysets.set(keysetId, key, pin);
}


// Bring a pinned tab to the focus, possibly shifting focus to its window.
async function focusTab(key, keysetId, options) {
  const keysets = await cache.getKeysets();
  const pin = keysets.get(keysetId, key);
  if (!pin) {
    throw new UserException(`No tab pinned for ${key} in keyset ${keysetId}.`);
  }
  let pinnedTab = await findTab(pin, key, keysetId);
  const [currentTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });

  if (pinnedTab === null) {
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
    keysets.set(keysetId, key, pin);
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

  pinTab(HISTORY_KEY, GLOBAL_KEYSET_ID, currentTab)
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
    await pinTab(args.key, args.keysetId, currentTab);
    await cache.flush();
  },
  'updatePin': async (args) => {
    await updatePin(args.key, args.keysetId, args.updates);
    await cache.flush();
  },
  'removePin': async (args) => {
    const keysets = await cache.getKeysets();
    keysets.remove(args.keysetId, args.key);
    await cache.flush();
  },
  'focusTab': async (args) => {
    await focusTab(args.key, args.keysetId);
    await cache.flush();
  },
  'summonTab': async (args) => {
    await focusTab(args.key, args.keysetId, { summon: true });
    await cache.flush();
  },
  'listPins': async (args) => {
    const pins = await listPins(args.keysetId);
    await cache.flush();
    return pins;
  },
});

chrome.runtime.onMessage.addListener(server.serve.bind(server));
