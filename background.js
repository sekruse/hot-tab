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


async function listPins() {
  await getPin('dummy');
  return pinCache;
}


// Pin a tab to a certain key, so that it can be focused or summoned later.
async function pinTab(args) {
  const [currentTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  await setPin(args.key, currentTab);
}


// Bring a pinned tab to the focus, possibly shifting focus to its window.
async function focusTab(args) {
  const pin = await getPin(args.key);
  if (!pin) {
    throw new Error(`No tab pinned for ${args.key}.`);
  }
  let pinnedTab = await chrome.tabs.get(pin.tabId);
  if (!pinnedTab) {
    throw new Error(`Tab could not be retried.`);
    // TODO: Create a new tab from the saved URL.
  }
  if (!pinnedTab.active) {
    pinnedTab = await chrome.tabs.update(pinnedTab.id, { active: true });
  }
  await chrome.windows.update(pinnedTab.windowId, { focused: true });
}


// Bring a pinned tab to the current window, right next to the current tab.
async function summonTab(args) {
  const pin = await getPin(args.key);
  if (!pin) {
    throw new Error(`No tab pinned for ${args.key}.`);
  }
  let pinnedTab = await chrome.tabs.get(pin.tabId);
  if (!pinnedTab) {
    throw new Error(`Tab could not be retried.`);
    // TODO: Create a new tab from the saved URL.
  }
  const [currentTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if ((currentTab.windowId !== pinnedTab.windowId) || (Math.abs(currentTab.index - pinnedTab.index) > 1)) {
    pinnedTab = await chrome.tabs.move(pinnedTab.id, {
      index: currentTab.index + 1,
      windowId: currentTab.windowId,
    });
  }
  pinnedTab = await chrome.tabs.update(pinnedTab.id, { active: true });
}


const messageHandlers = {
  'pinTab': pinTab,
  'focusTab': focusTab,
  'summonTab': summonTab,
  'listPins': listPins,
};

chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  console.log(`Incoming message: ${JSON.stringify(msg)}`);
  const handler = messageHandlers[msg.command];
  if (!handler) {
    throw new Error(`No handler for message: ${JSON.stringify(msg)}`);
  }
  handler(msg.args).then((result) => {
    const response = { success: true, result };
    console.log(`Response: ${JSON.stringify(response)}`);
    respond(response);
  }).catch((error) => {
    const response = { success: false, errorMessage: JSON.stringify(error) };
    console.log(`Response: ${JSON.stringify(response)}`);
    respond(response);
  });
  return true;
});
