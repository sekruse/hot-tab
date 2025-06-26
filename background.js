import { Server, UserException } from './lpc.js';

const GLOBAL_KEYSET_ID = -1;
const HISTORY_KEY = 'Backspace';

// Maps key codes to pinned tabs.
let stateCache = null;
let keysetCache = null;

const defaultState = {
  keysetId: 1,
};

const defaultKeysets = (function*() {
  yield GLOBAL_KEYSET_ID;
  for (let i = 0; i < 10; i++) { yield i; }
})().reduce((acc, val) => {
  acc[val] = {};
  return acc;
}, []);

async function getState() {
  if (stateCache === null) {
    const loaded = await chrome.storage.local.get('state');
    stateCache = {...defaultState, ...loaded.state};
  }
  return stateCache;
}

async function storeState() {
  if (stateCache === null) {
    return;
  }
  return chrome.storage.local.set({'state': stateCache});
}

async function setActiveKeysetId(keysetId) {
  const state = await getState();
  state.keysetId = keysetId;
  await storeState();
}

async function getPin(key, keysetId) {
  if (keysetCache === null) {
    const loaded = await chrome.storage.local.get('keysets');
    keysetCache = {...defaultKeysets, ...loaded.keysets};
  }
  return keysetCache[keysetId][key];
}

async function removePin(key, keysetId) {
  // Check if work is necessary but also make sure that keysetCache is loaded.
  if (!await getPin(key, keysetId)) {
    return;
  }
  delete keysetCache[keysetId][key];
  await chrome.storage.local.set({ keysets: keysetCache });
}

async function setPin(key, keysetId, tab, overrides) {
  await getPin(key, keysetId); // Ensure keysetCache is loaded.
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
  keysetCache[keysetId][key] = pin;
  await chrome.storage.local.set({ keysets: keysetCache });
}

async function updatePin(key, keysetId, updates) {
  const pin = await getPin(key, keysetId); // Ensure keysetCache is loaded.
  ['title', 'url', 'urlPattern'].forEach(p => {
    if (p in updates) {
      pin[p] = updates[p];
    }
  });
  if (('key' in updates && updates.key !== key) || ('keysetId' in updates && updates.keysetId != keysetId)) {
    delete keysetCache[keysetId][key];
    keysetCache[updates.keysetId || keysetId][updates.key || key] = pin;
  }
  await chrome.storage.local.set({ keysets: keysetCache });
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
    if (key && keysetId != null) {
      await setPin(key, keysetId, tab, {
        title: pin.title,
        favIconUrl: pin.favIconUrl,
        url: pin.url,
        urlPattern: pin.urlPattern,
      });
    }
    return tab;
  }
  return null;
}

async function listPins(keysetId) {
  await getPin('A', keysetId);  // dummy values
  const keyset = keysetCache[keysetId];
  await Promise.all(Object.keys(keyset).map(async (key) => {
    const pin = keysetCache[keysetId][key];
    const tab = await findTab(pin, key, keysetId);
    if (!tab) {
      delete pin.tabId;
      delete pin.windowId;
      delete pin.index;
    }
  }));
  return keyset;
}


// Pin a tab to a certain key, so that it can be focused or summoned later.
async function pinTab(key, keysetId, tab) {
  if (!tab) {
    const [currentTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    tab = currentTab
  }
  await setPin(key, keysetId, tab);
}

// Recreate a pinned tab.
async function resurrectTab(pin) {
  console.log(`Resurrecting tab for ${JSON.stringify(pin)}...`);
  let window;
  try {
    window = await chrome.windows.get(pin.windowId)
  } catch (error) {
    window = await chrome.windows.getLastFocused();
  }
  console.log(`Creating the tab in ${JSON.stringify(window)}...`);
  return chrome.tabs.create({
    url: pin.url,
    windowId: window.id,
  })
}


// Bring a pinned tab to the focus, possibly shifting focus to its window.
async function focusTab(key, keysetId) {
  const pin = await getPin(key, keysetId);
  if (!pin) {
    throw new UserException(`No tab pinned for ${key} in keyset ${keysetId}.`);
  }
  let pinnedTab = await findTab(pin, key, keysetId);
  if (pinnedTab === null) {
    pinnedTab = await resurrectTab(pin);
    // At this point, the tab has been created but it's loading the URL is likely pending.
    // So we update only basic properties of our pin.
    await setPin(key, keysetId, pinnedTab, {
      title: pin.title,
      favIconUrl: pin.favIconUrl,
      url: pin.url,
      urlPattern: pin.urlPattern,
    });
  }
  const [currentTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (currentTab.id === pinnedTab.id) {
    return;
  }
  if (!pinnedTab.active) {
    pinnedTab = await chrome.tabs.update(pinnedTab.id, { active: true });
  }
  await chrome.windows.update(pinnedTab.windowId, { focused: true });

  // Fire and forget.
  pinTab(HISTORY_KEY, keysetId, currentTab)
}

// Bring a pinned tab to the current window, right next to the current tab.
async function summonTab(key, keysetId) {
  const pin = await getPin(key, keysetId);
  if (!pin) {
    throw new Error(`No tab pinned for ${key} in keyset ${keysetId}.`);
  }
  let pinnedTab;
  try {
    pinnedTab = await chrome.tabs.get(pin.tabId);
  } catch (error) {
    pinnedTab = await resurrectTab(pin);
    // At this point, the tab has been created but it's loading the URL is likely pending.
    // So we update only basic properties of our pin.
    await setPin(key, keysetId, pinnedTab, {
      title: pin.title,
      favIconUrl: pin.favIconUrl,
      url: pin.url,
      urlPattern: pin.urlPattern,
    });
  }
  const [currentTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (currentTab.id === pinnedTab.id) {
    return;
  }
  if ((currentTab.windowId !== pinnedTab.windowId) || (Math.abs(currentTab.index - pinnedTab.index) > 1)) {
    pinnedTab = await chrome.tabs.move(pinnedTab.id, {
      index: currentTab.index + 1,
      windowId: currentTab.windowId,
    });
  }
  pinnedTab = await chrome.tabs.update(pinnedTab.id, { active: true });

  // Fire and forget.
  pinTab(HISTORY_KEY, keysetId, currentTab)
}


const server = new Server({
  'getState': async (args) => {
    return getState();
  },
  'setActiveKeysetId': async (args) => {
    await setActiveKeysetId(args.keysetId);
  },
  'pinTab': async (args) => {
    return pinTab(args.key, args.keysetId);
  },
  'updatePin': async (args) => {
    await updatePin(args.key, args.keysetId, args.updates);
  },
  'removePin': async (args) => {
    await removePin(args.key, args.keysetId);
  },
  'focusTab': async (args) => {
    await focusTab(args.key, args.keysetId);
  },
  'summonTab': async (args) => {
    await summonTab(args.key, args.keysetId);
  },
  'listPins': async (args) => {
    return listPins(args.keysetId);
  },
});

chrome.runtime.onMessage.addListener(server.serve.bind(server));
