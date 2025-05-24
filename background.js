import { UserException } from './lpc.js';
// Maps key codes to pinned tabs.
let pinCache = null;

async function getPin(key) {
  if (pinCache === null) {
    const loaded = await chrome.storage.local.get('pins');
    pinCache = loaded.pins || {};
  }
  return pinCache[key];
}

async function removePin(key) {
  // Check if work is necessary but also make sure that pinCache is loaded.
  if (!await getPin(key)) {
    return;
  }
  delete pinCache[key];
  await chrome.storage.local.set({ pins: pinCache });
}

async function setPin(key, tab) {
  await getPin(key); // Ensure pinCache is loaded.
  pinCache[key] = {
    tabId: tab.id,
    windowId: tab.windowId,
    index: tab.index,
    title: tab.title,
    url: tab.url,
    favIconUrl: tab.favIconUrl,
  }
  await chrome.storage.local.set({ pins: pinCache });
}

async function updatePin(key, updates) {
  const pin = await getPin(key); // Ensure pinCache is loaded.
  ['title', 'url', 'urlPattern'].forEach(p => {
    if (p in updates) {
      pin[p] = updates[p];
    }
  });
  if ('key' in updates && updates.key !== key) {
    delete pinCache[key];
  }
  await chrome.storage.local.set({ pins: pinCache });
}

async function listPins() {
  await getPin('dummy');
  return pinCache;
}


// Pin a tab to a certain key, so that it can be focused or summoned later.
async function pinTab(args, tab) {
  if (!tab) {
    const [currentTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    tab = currentTab
  }
  await setPin(args.key, tab);
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
async function focusTab(args) {
  const pin = await getPin(args.key);
  if (!pin) {
    throw new UserException(`No tab pinned for ${args.key}.`);
  }
  try {
    pinnedTab = await chrome.tabs.get(pin.tabId);
  } catch (error) {
    pinnedTab = await resurrectTab(pin);
    // At this point, the tab has been created but it's loading the URL is likely pending.
    // So we update only basic properties of our pin.
    await setPin(args.key, {
      id: pinnedTab.id,
      windowId: pinnedTab.windowId,
      index: pinnedTab.index,
      title: pin.title,
      url: pin.url,
      favIconUrl: pin.favIconUrl,
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
  pinTab({ key: 'Backspace' }, currentTab)
}

// Bring a pinned tab to the current window, right next to the current tab.
async function summonTab(args) {
  const pin = await getPin(args.key);
  if (!pin) {
    throw new Error(`No tab pinned for ${args.key}.`);
  }
  let pinnedTab;
  try {
    pinnedTab = await chrome.tabs.get(pin.tabId);
  } catch (error) {
    pinnedTab = await resurrectTab(pin);
    // At this point, the tab has been created but it's loading the URL is likely pending.
    // So we update only basic properties of our pin.
    await setPin(args.key, {
      id: pinnedTab.id,
      windowId: pinnedTab.windowId,
      index: pinnedTab.index,
      title: pin.title,
      url: pin.url,
      favIconUrl: pin.favIconUrl,
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
  pinTab({ key: 'Backspace' }, currentTab)
}


const messageHandlers = {
  'pinTab': pinTab,
  'updatePin': async (args) => {
    await updatePin(args.key, args.updates);
  },
  'removePin': async (args) => {
    await removePin(args.key);
  },
  'focusTab': focusTab,
  'summonTab': summonTab,
  'listPins': listPins,
};

chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  console.log(`Incoming message: ${JSON.stringify(msg)}`);
  const handler = messageHandlers[msg.command];
  if (!handler) {
    throw new UserException(`No handler for message: ${JSON.stringify(msg)}`);
  }
  handler(msg.args).then((result) => {
    const response = { success: true, result };
    console.log(`Response: ${JSON.stringify(response)}`);
    respond(response);
  }).catch((error) => {
    console.log(error);
    const response = {
        success: false,
        error: {
          name: error.name,
          message: error.message,
        }
      };
    console.log(`Response: ${JSON.stringify(response)}`);
    respond(response);
  });
  return true;
});
