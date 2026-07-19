import { Server, UserException } from './lpc.js';
import { Cache, MAX_HISTORY_ENTRIES } from './storage.js';
import combos from './combos.js';
import { LAYER_IDS, GLOBAL_LAYER_ID, keysByKeyCode } from './keys.js';
const cache = new Cache();

// This toggle is flipped when this extension navigates through the tab history, signaling that the next tab activation should not update the history.
// Because it seems essentially impossible that the service worker is preempted in between those two events, we don't track this value as state.
let skipUpdateHistory = false;

/**
 * Finds which meta pattern matches the given URL.
 */
function applyMetaPatterns(metaPatterns, url) {
  let matchingMetaPattern;
  for (let i = 0; i < metaPatterns.length; i++) {
    const metaPattern = metaPatterns[i];
    try {
      const mp = new URLPattern(metaPattern);
      const match = mp.exec(url);
      if (match) {
        return instantiateMetaPattern(metaPattern, match, url);
      }
    } catch {
      // Skip invalid patterns
    }
  }
  return null;
}

/**
 * Turns a meta pattern into a URL pattern based on a match.
 */
function instantiateMetaPattern(metaPattern, match, url) {
  // Build a map of all named groups across pathname, search, hash, etc.
  const allGroups = {};
  for (const key of Object.keys(match.pathname.groups || {})) {
    allGroups[key] = match.pathname.groups[key];
  }
  for (const key of Object.keys(match.search?.groups || {})) {
    allGroups[key] = match.search.groups[key];
  }
  for (const key of Object.keys(match.hash?.groups || {})) {
    allGroups[key] = match.hash.groups[key];
  }

  // Walk the pattern string and replace :name captures with their matched values.
  // URLPattern uses :name for named groups in the pathname.
  // We need to handle them in path segments like /:docid/*
  let filled = '';
  let i = 0;
  while (i < metaPattern.length) {
    if (metaPattern[i] === ':' && i + 1 < metaPattern.length && metaPattern[i + 1] !== '*') {
      // Potential named capture
      let nameEnd = i + 1;
      while (nameEnd < metaPattern.length && /[a-zA-Z0-9_]/.test(metaPattern[nameEnd])) {
        nameEnd++;
      }
      const name = metaPattern.slice(i + 1, nameEnd);
      if (name in allGroups) {
        filled += '/' + allGroups[name];
      } else {
        filled += metaPattern.slice(i, nameEnd);
      }
      i = nameEnd;
    } else if (metaPattern[i] === '*') {
      // Single wildcard - keep as-is (will match everything remaining)
      filled += '*';
      i++;
    } else {
      filled += metaPattern[i];
      i++;
    }
  }

  // If the filled pattern doesn't contain any wildcards and ends without a wildcard,
  // append /* to match query/hash
  if (!filled.includes('*')) {
    // Check if there was originally a trailing wildcard
    const trimmedPattern = metaPattern.replace(/^https?:\/\//, '');
    if (trimmedPattern.match(/\/\*$/)) {
      filled += '/*';
    }
  }

  return filled;
}


/**
 * Turns a URL string into a URL pattern string that matches only that origin and path.
 */
function urlToPatternString(url) {
  const u = new URL(url);
  u.hash = '';
  u.search = '';
  return u.toString();
}

/**
 * Resolves a pin to an actual Chrome tab by tabId or URL pattern.
 * Does NOT modify any slots or layers. Returns the resolved tab and an updated pin.
 */
async function resolvePinToTab(pin, keyRef) {
  // First, try to retrieve the tab by its stored tabId.
  if (pin.tabId !== undefined) {
    try {
      const tab = await chrome.tabs.get(pin.tabId);
      return { tab, pin: createPin(tab) };
    } catch (error) {
      console.log(`Tab for ${pin.title} not found: ${error}`);
    }
  }
  // Otherwise, try to find a tab that matches the URL pattern.
  let urlPattern;
  try {
    urlPattern = new URLPattern(pin.urlPattern);
  } catch (e) {
    console.warn(`Bad URL pattern for ${keyRef ? JSON.stringify(keyRef) : "n/a"}: "${pin.urlPattern}"`, e);
    // Degrade gracefully, mark the pin as dangling.
    return { tab: null, pin: { ...pin } };
  }

  let tabs = await chrome.tabs.query({});
  tabs = tabs.filter((tab) => {
    try {
      return urlPattern.test(tab.url);
    } catch {
      return false;
    }
  });

  if (tabs.length > 0) {
    const tab = tabs[0];
    return {
      tab,
      pin: {
        ...createPin(tab),
        title: pin.title,
        favIconUrl: pin.favIconUrl,
        url: pin.url,
        urlPattern: pin.urlPattern,
      },
    };
  }
  // Tab not found — mark as dangling.
  return { tab: null, pin: { ...pin } };
}

/**
 * Activates (focuses) a tab for the given pin. Creates a new tab if the old one doesn't exist.
 * Handles resolution, recreation, summon, reset, and focus — all in one place.
 * Returns the activated tab and the updated pin so the caller can persist it.
 */
async function activateTab(pin, options) {
  const [currentTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });

  // Resolve the pin to an actual tab
  const { tab: existingTab, pin: resolvedPin } = await resolvePinToTab(pin);

  let tab = existingTab;

  if (tab == null || options?.recreate) {
    // We need to create a new tab.
    const createOptions = {};
    if (currentTab) {
      createOptions.windowId = currentTab.windowId;
      createOptions.index = currentTab.index + 1;
    } else {
      let win;
      try {
        win = await chrome.windows.getLastFocused();
      } catch {
        skipUpdateHistory = options?.skipUpdateHistory || false;
        win = await chrome.windows.create({ type: 'normal', focused: true });
      }
      createOptions.windowId = win.id;
    }
    const createdTab = await chrome.tabs.create({ url: resolvedPin.url, ...createOptions });
    tab = createdTab;
  }

  if (tab != null) {
    if (options?.reset) {
      await chrome.tabs.update(tab.id, { url: resolvedPin.url });
    }
    if (options?.summon && currentTab) {
      if ((currentTab.windowId !== tab.windowId) || (Math.abs(currentTab.index - tab.index) > 1)) {
        tab = await chrome.tabs.move(tab.id, {
          index: currentTab.index + 1,
          windowId: currentTab.windowId,
        });
      }
    }

    // Make sure the tab is in the foreground.
    if (!tab.active) {
      skipUpdateHistory = options?.skipUpdateHistory || false;
      tab = await chrome.tabs.update(tab.id, { active: true });
    }
    await chrome.windows.update(tab.windowId, { focused: true });
  }

  // Return the pin that should be persisted (freshly created or resolved)
  const finalPin = tab ? createPin(tab) : resolvedPin;
  return { tab, pin: finalPin };
}

/**
 * Finds the tab linked to the given pin. Updates the layer slot with the resolved pin.
 * @param {Object} pin - The pin to work with.
 * @param {Object} keyRef - A reference to the slot the pin is stored at.
 * @returns {Promise<Object>} The updated pin and the tab if any could be found.
 */
async function findTab(pin, keyRef) {
  const { tab, pin: resolvedPin } = await resolvePinToTab(pin, keyRef);

  if (tab) {
    const layers = await cache.getLayers();
    layers.set(keyRef, resolvedPin);
    return { pin: resolvedPin, tab };
  }

  // Tab not found — mark as dangling.
  delete resolvedPin.tabId;
  const layers = await cache.getLayers();
  layers.set(keyRef, resolvedPin);
  return { pin: resolvedPin };
}

/**
 * Lists the pins found on the given layers.
 * @param {?number[]} layerIds - The IDs of the layers to inspect. Leading layers overlay the following layers.
 * @returns {!Promise<Object>} An object whose keys are the key codes of the pins and the values are the pins.
 */
async function listPins(layerIds, options) {
  const layers = await cache.getLayers();
  let entries = layerIds
    ? layers.getView(layerIds).listEntries()
    : layers.listAllEntries();
  return Promise.all(entries.map(async (entry) => {
    const { pin } = await findTab(entry.value, entry.keyRef);
    return { keyRef: entry.keyRef, pin };
  }));
}

/**
 * Finds a pin for the given tab in the given layers.
 * @param {number} tabId - ID of the Chrome tab to look for
 * @param {number[]} layerIds - The IDs of the layers to inspect.
 * @returns {Promise<?Object>} An object with the keyRef and pin if a pin could be found.
 */
async function findPin(tabId, layerIds) {
  for (let i = 0; i < layerIds.length; i++) {
    const layerId = layerIds[i];
    const entries = await listPins([layerId]);
    for (let j = 0; j < entries.length; j++) {
      const entry = entries[j];
      if (entry.pin.tabId === tabId) {
        return entry;
      }
    }
  }
}

async function findNeighborPin(tabId, layerIds, shift) {
  const entries = await listPins(layerIds);
  if (entries.length == 0) {
    throw new UserException(`No tabs are pinned.`);
  }
  const options = await cache.getOptions();
  let indexByKeyCode = options.getKeyOrderIndexedByKeyCode();
  let finalEntries = entries
    .filter((e) => indexByKeyCode.has(e.keyRef.key))
    .sort((e1, e2) => indexByKeyCode.get(e1.keyRef.key) - indexByKeyCode.get(e2.keyRef.key));
  if (finalEntries.length == 0) {
    finalEntries = entries.sort((e1, e2) => e1.keyRef.key.localeCompare(e2.keyRef.key));
  }
  let curIndex = finalEntries.findIndex((e) => e.pin.tabId == tabId);
  let nextIndex;
  if (curIndex == -1) {
    nextIndex = (shift >= 0) ? 0 : -1;
  } else {
    nextIndex = curIndex + shift;
  }
  nextIndex = (nextIndex + finalEntries.length) % finalEntries.length
  return finalEntries[nextIndex];
}

async function calculateFallbackLayerName(layerId) {
  const entries = await listPins([layerId]);
  if (entries.length === 0) {
    return `Layer ${layerId}`;
  }
  const options = await cache.getOptions();
  const indexByKeyCode = options.getKeyOrderIndexedByKeyCode();

  // Many titles are of the form "<name> - <site and other info>" (or similar).
  // We take only the first part for the layer name.
  const truncate = (title) => {
    const map = title.split(/\s+[^\w\s]+\s+/);
    return map[0].trim();
  };

  const sortedPins = entries
    .filter(e => indexByKeyCode.has(e.keyRef.key))
    .sort((a, b) => indexByKeyCode.get(a.keyRef.key) - indexByKeyCode.get(b.keyRef.key))
    .map(e => truncate(e.pin.title));

  if (sortedPins.length === 0) {
    return entries
      .sort((a, b) => a.keyRef.key.localeCompare(b.keyRef.key))
      .slice(0, 3)
      .map(e => truncate(e.pin.title))
      .join(', ');
  }

  return sortedPins.slice(0, 3).join(', ');
}

/**
 * Creates a pin object.
 * @param {Object} The tab to pin.
 * @param {Object} options - Pin options.
 * @param {string} options.pinScope - "origin" or "page".
 * @param {string[]} [options.metaPatterns] - URL patterns to match against.
 * @returns {Object} The pin.
 */
function createPin(tab, options) {
  let url;
  try {
    url = new URL(tab.url);
  } catch (error) {
    console.warn(`Invalid URL pattern for tab "${tab.title}": "${tab.urlPattern}"`, error);
    url = new URL('chrome://newtab');
  }
  let urlPattern;
  if (options?.pinScope === 'origin') {
    urlPattern = `${url.origin}/*`;
  } else if (options?.pinScope === 'page') {
    const metaPatterns = options.metaPatterns || [];
    let urlPattern = applyMetaPatterns(metaPatterns, tab.url);
  }
  if (!urlPattern) {
    urlPattern = urlToPatternString(url);
  }
  let pin = {
    tabId: tab.id,
    index: tab.index,
    title: tab.title,
    url: tab.url,
    urlPattern: urlPattern,
    favIconUrl: tab.favIconUrl,
    windowId: tab.windowId,
  };
  return pin;
}

/**
 * Bring a pinned tab to the focus, possibly shifting focus to its window.
 * If the tab does not exist, it is being created.
 * @param {string} key - The key code under which the pin is stored.
 * @param {number} layerId - The layer in whichthe pin is stored.
 * @param {bool} options.recreate - Whether a new tab should be created in any case.
 * @param {bool} options.reset - Whether the tab should be reset to the pinned URL.
 * @param {bool} options.summon - Whether the tab should be moved near the currently active tab.
 */
async function focusTab(key, layerId, options) {
  const layers = await cache.getLayers();
  const layer = layers.getView([GLOBAL_LAYER_ID, layerId]);
  const pin = layer.get(key);
  if (!pin) {
    throw new UserException(`There is no pin at ${key} in layer ${layerId}.`);
  }
  const { pin: finalPin } = await activateTab(pin, options);
  layer.set(key, finalPin);
  await cache.flush();
}

async function closeTab(key, layerId) {
  const layers = await cache.getLayers();
  const layer = layers.getView([GLOBAL_LAYER_ID, layerId]);
  const pin = layer.get(key);
  if (!pin) {
    throw new UserException(`There is no pin at ${key} in layer ${layerId}.`);
  }
  const { tab: pinnedTab } = await findTab(pin, { key, layerId });
  if (!pinnedTab) {
    return;
  }
  await chrome.tabs.remove(pinnedTab.id);
}

async function closeTabs(layerId) {
  const layerIds = [layerId];  // No global: require global tabs to be closed explicitly
  const entries = await listPins(layerIds);
  await Promise.all(entries.map(async ({ pin }) => {
    if (pin.tabId == null) {
      return;
    }
    await chrome.tabs.remove(pin.tabId);
  }));
}

async function closeUnpinnedTabs(layerId) {
  const selectedLayerIds = (layerId == null)
    ? LAYER_IDS.map(kid => [kid])
    : [[GLOBAL_LAYER_ID, layerId]];
  const entrySets = await Promise.all(selectedLayerIds.map((layerIds) => listPins(layerIds)));
  const allPinnedTabIds = entrySets.map((entries) => {
    return entries
      .filter(({ pin }) => (pin.tabId != null))
      .map(({ pin }) => pin.tabId);
  }).map((tabIds) => new Set(tabIds))
    .reduce((agg, val) => agg.union(val), new Set());
  const allTabs = await chrome.tabs.query({});
  await Promise.all(allTabs.map(async (tab) => {
    if (allPinnedTabIds.has(tab.id)) {
      return;
    }
    await chrome.tabs.remove(tab.id);
  }));
}


/**
 * Updates the registered badge texts for the Chrome action item.
 * @param {Object} options What to register.
 * @param {Object[]=} options.entries the pins to update for
 * @param {Object[]=} options.removedEntries the pins to remove
 * @param {number=} options.layerId the current layer ID
 */
async function refreshBadgeTexts(options) {
  const p = [];
  if (options.layerId != null) {
    const text = `${options.layerId}`;
    p.push(chrome.action.setBadgeText({ text }));
  }
  if (options.entries) {
    for (let i = 0; i < options.entries.length; i++) {
      const { keyRef, pin } = options.entries[i];
      if (pin.tabId == null) {
        continue;
      }
      const text = `${keyRef.layerId}${keysByKeyCode.get(keyRef.key).char}`;
      p.push(chrome.action.setBadgeText({ tabId: pin.tabId, text }));
    }
  }
  if (options.removedEntries) {
    for (let i = 0; i < options.removedEntries.length; i++) {
      const { keyRef, pin } = options.removedEntries[i];
      if (pin.tabId == null) {
        continue;
      }
      p.push(chrome.action.setBadgeText({ tabId: pin.tabId }));
    }
  }
  return Promise.all(p);
}
cache.addPinChangedListener((keyRef, pin, event) => {
  if (event == 'SET') {
    return refreshBadgeTexts({ entries: [{ keyRef, pin }] });
  }
  if (event == 'DELETE') {
    return refreshBadgeTexts({ removedEntries: [{ keyRef, pin }] });
  }
  throw new Error(`Unknown event type: ${event}`);

});
cache.addLayerChangedListener((layerId) => {
  return refreshBadgeTexts({ layerId });
});
cache.getState().then((state) => refreshBadgeTexts({ layerId: state.getLayerId() }));
cache.getLayers()
  .then((layers) => layers.listAllEntries())
  .then((entries) => refreshBadgeTexts({
    entries: entries.map((e) => {
      return { keyRef: e.keyRef, pin: e.value };
    }),
  }));
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // The badge text is reset when the tab navigates to a new location.
  // Hence, we need to update it continuously.
  if (changeInfo.status != 'complete') {
    return;
  }
  const entry = await findPin(tabId, LAYER_IDS);
  if (!entry) {
    return;
  }
  await refreshBadgeTexts({ entries: [entry] });
});

// Tracks tab navigation via onActivated.
chrome.tabs.onActivated.addListener(async ({ tabId, windowId }) => {
  // Don't update the history when asked to. Clear the toggle, because the skipping has been done.
  if (skipUpdateHistory) {
    skipUpdateHistory = false;
    return;
  }

  // At this point, we need to update the history, putting the activated tab to the tail.
  // First get the tab to store it.
  const history = await cache.getTabHistory();
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab) {
    return;
  }

  // Update and flush the history.
  history.push(createPin(tab, { pinScope: 'page' }));
  await cache.flush();
});


// Updates history entries when a tab is replaced (resurrected with a new tabId).
chrome.tabs.onReplaced.addListener(async (addedTabId, removedTabId) => {
  const history = await cache.getTabHistory();
  history.update((e) => {
    if (e.tabId === removedTabId) {
      return { ...e, tabId: removedTabId };
    }
  });
  await cache.flush();
});

// Updates the history when a tab has changed.
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!tab) return;
  const newPin = createPin(tab, { pinScope: 'page' });
  const history = await cache.getTabHistory();
  history.update((e) => {
    if (e.tabId === tabId) {
      return newPin;
    }
  });
  await cache.flush();
});

/**
 * Calculates (n + k) mod mod.
 */
function plusMod(n, k, mod) {
  return (n + k + mod) % mod;
}

/**
 * Attemps to highlight the given tabs in the given window. Retries if the highlight
 * hasn't been applied correctly, which has been observed on macOS, presumably due to window animations.
 */
async function highlightWithRetry(windowId, indices) {
  for (let i = 0; i < 3; i++) {
    await chrome.tabs.highlight({ windowId, tabs: indices });
    const tabs = await chrome.tabs.query({ windowId });
    const highlightedIndices = tabs.filter((t) => t.highlighted).map((t) => t.index);
    if (indices.every((idx) => highlightedIndices.includes(idx))) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, i * 50));
  }
}

/**
 * Moves a contiguous block of tabs to a new starting position.
 * It moves each tab one by one, in reverse order, to prevent
 * indices from shuffling. This seems to happen with chrome.tabs.move()
 * when moving multiple tabs to the right.
 */
async function moveTabsRight(tabIds, targetStartIndex) {
  const movedTabs = [];
  for (let i = tabIds.length - 1; i >= 0; i--) {
    const tabId = tabIds[i];
    const targetIndex = targetStartIndex + i;
    movedTabs[i] = await chrome.tabs.move(tabId, { index: targetIndex });
  }
  return movedTabs;
}

const server = new Server({
  'getState': async (args) => {
    const state = await cache.getState();
    return state.data;
  },
  'setActiveLayerId': async (args) => {
    const state = await cache.getState();
    if (args.layerId != null) {
      state.setLayerId(args.layerId);
    } else {
      const layers = await cache.getLayers();
      let success = false;
      for (let i = 1; i < LAYER_IDS.length; i++) {
        const layerId = LAYER_IDS[i];
        if (layerId == GLOBAL_LAYER_ID) {
          continue;
        }
        const layer = layers.getView([layerId]);
        if (layer.listEntries().length == 0) {
          state.setLayerId(layerId);
          success = true;
          break;
        }
      }
      if (!success) {
        throw new UserException('No free layer found.');
      }
    }
    await cache.flush();
  },
  'listCommandCombos': async (args) => {
    const options = await cache.getOptions();
    return options.listCommandCombos();
  },
  'setCommandCombo': async (args) => {
    const options = await cache.getOptions();
    options.setCommandCombo(args.command, args.combo);
    await cache.flush();
  },
  'getKeyOrder': async () => {
    const options = await cache.getOptions();
    return options.getKeyOrder();
  },
  'setKeyOrder': async (args) => {
    const options = await cache.getOptions();
    options.setKeyOrder(args.inputChars.toUpperCase());
    await cache.flush();
  },
  'getLayerConfig': async (args) => {
    const configs = await cache.getLayerConfigs();
    const config = { ...configs.get(args.layerId) };
    config.nameIsFallback = false;
    if (args.includeFallback && !config.name) {
      config.name = await calculateFallbackLayerName(args.layerId);
      config.nameIsFallback = true;
    }
    return config;
  },
  'setLayerConfig': async (args) => {
    const configs = await cache.getLayerConfigs();
    configs.set(args.layerId, args.config);
    await cache.flush();
  },
  'pinTab': async (args) => {
    const [currentTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!currentTab) {
      throw new UserException(`There is no active tab to be pinned.`);
    }
    if (args.options?.dupeScope) {
      let layerIds;
      if (args.options.dupeScope == 'layer') {
        layerIds = [args.layerId];
      } else if (args.options.dupeScope == 'view') {
        layerIds = [GLOBAL_LAYER_ID, args.layerId];
      } else if (args.options.dupeScope == 'global') {
        layerIds = LAYER_IDS;
      } else {
        throw new UserException(`Bad dupe scope: ${args.options.dupeScope}`);
      }
      const entry = await findPin(currentTab.id, layerIds);
      if (entry) {
        throw new UserException(`This tab is already pinned at ${entry.keyRef.key} in layer ${entry.keyRef.layerId}.`);
      }
    }
    const layers = await cache.getLayers();
    const options = await cache.getOptions();
    const layer = layers.getView([GLOBAL_LAYER_ID, args.layerId]);
    let key = args.key;
    if (!key) {
      const keyOrder = options.getKeyOrder();
      for (let i = 0; i < keyOrder.length; i++) {
        const nextKey = keyOrder[i];
        if (!layer.get(nextKey.keyCode)) {
          key = nextKey.keyCode;
          break;
        }
      }
    }
    if (!key) {
      throw new UserException('There is no more free key slot among the default keys.');
    }
    const pinOptions = {
      pinScope: args.options?.pinScope,
      metaPatterns: options.getMetaPatterns(),
    };
    if (args.options?.dupeScope) {
      pinOptions.dupeScope = args.options.dupeScope;
    }
    const pin = createPin(currentTab, pinOptions);
    const layerId = layer.set(key, pin);
    await cache.flush();
    return { layerId };
  },
  'updatePin': async (args) => {
    const layers = await cache.getLayers();
    const srcRef = {
      layerId: args.layerId,
      key: args.key,
    };
    const dstRef = { ...srcRef };
    if (args.updates.layerId != null) {
      dstRef.layerId = args.updates.layerId;
    }
    if (args.updates.key != null) {
      dstRef.key = args.updates.key;
    }
    const pin = layers.get(srcRef);
    if ('urlPattern' in args.updates) {
      try {
        new URLPattern(args.updates.urlPattern);
      } catch {
        throw new UserException(`Invalid URL pattern: ${args.updates.urlPattern}`);
      }
    }
    ['title', 'url', 'urlPattern'].forEach(p => {
      if (p in args.updates) {
        pin[p] = args.updates[p];
      }
    });
    if (srcRef.layerId !== dstRef.layerId || srcRef.key !== dstRef.key) {
      const dstPin = layers.get(dstRef);
      if (args.swap && dstPin) {
        layers.set(srcRef, dstPin);
      } else {
        layers.remove(srcRef);
      }
    }
    layers.set(dstRef, pin);
    await cache.flush();
  },
  'clearLayer': async (args) => {
    const layers = await cache.getLayers();
    const layer = layers.getView([args.layerId]);
    layer.listEntries().forEach((e) => layer.remove(e.keyRef.key));
    await cache.flush();
  },
  'removePin': async (args) => {
    const layers = await cache.getLayers();
    const layer = layers.getView([GLOBAL_LAYER_ID, args.layerId]);
    const layerId = layer.remove(args.key);
    await cache.flush();
    return { layerId };
  },
  'focusTab': async (args) => {
    await focusTab(args.key, args.layerId, args.options);
    await cache.flush();
  },
  'focusNeighborTab': async (args) => {
    const [currentTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!currentTab) {
      throw new UserException('There is no active tab.');
    }
    // The global layer is intentionally excluded.
    const entry = await findNeighborPin(currentTab.id, [args.layerId], args.shift);
    await focusTab(entry.keyRef.key, entry.keyRef.layerId, args.options);
    await cache.flush();
  },
  'getTabHistory': async () => {
    const history = await cache.getTabHistory();
    return history.data.entries.map((entry) => ({ ...entry }));
  },
  'navigateHistory': async (args) => {
    // Determine the history entry to navigate to.
    const history = await cache.getTabHistory();
    let newPos;
    if (args.index !== undefined) {
      newPos = args.index;
    } else {
      const dir = args.direction;  // -1 or +1
      const [currentTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      let pos;
      if (currentTab) {
        pos = history.findPosition(currentTab.id);
      }
      if (pos === -1) {
        // Fallback: If the current tab isn't in the history, we act as if we were beyond the latest entry, permitting to go back at least.
        console.log(`Current tab (${currentTab.url}, id=${currentTab.id}) not found in the history.`);
        pos = history.data.entries.length;
      }
      newPos = pos + dir;
    }
    if (newPos < 0 || newPos >= history.data.entries.length) {
      throw new UserException(`No history entry at position ${newPos}.`);
    }

    // Activate the history entry's tab. Make sure to update the tab ID if that changes.
    const entry = history.getEntry(newPos);
    const { pin: finalPin } = await activateTab(entry, { recreate: false, summon: false, skipUpdateHistory: true });
    history.setEntry(newPos, finalPin);
    await cache.flush();
  },
  'clearHistory': async () => {
    const history = await cache.getTabHistory();
    history.clear();
    // Historical: clear any pin stored at the Backspace key ref in layer 0.
    // This slot was historically used as a "jump back" pin — clear pending values for consistency.
    const layers = await cache.getLayers();
    const jumpBackRef = { layerId: GLOBAL_LAYER_ID, key: 'Backspace' };
    if (layers.get(jumpBackRef)) {
      layers.remove(jumpBackRef);
    }
    await cache.flush();
  },
  'moveWindows': async (args) => {
    const highlightedTabs = await chrome.tabs.query({ highlighted: true, lastFocusedWindow: true });
    if (highlightedTabs.length === 0) {
      throw new UserException('There is no active or highlighted tab.');
    }
    // Maintain relative order by sorting by index.
    highlightedTabs.sort((a, b) => a.index - b.index);

    const currentTab = highlightedTabs.find((t) => t.active) || highlightedTabs[0];
    const tabIds = highlightedTabs.map((t) => t.id);

    if (args.createWindow) {
      const newWindow = await chrome.windows.create({
        focused: true,
        tabId: currentTab.id,
      });
      const otherTabIds = tabIds.filter((id) => id !== currentTab.id);
      if (otherTabIds.length > 0) {
        let movedTabs = await chrome.tabs.move(otherTabIds, { windowId: newWindow.id, index: -1 });
        if (!Array.isArray(movedTabs)) movedTabs = [movedTabs];
        await highlightWithRetry(newWindow.id, [currentTab, ...movedTabs].map((t) => t.index));
      }
      return;
    }
    let windows = await chrome.windows.getAll({
      windowTypes: ['normal'],
    });
    const acceptedWindowStates = new Set(['normal', 'maximized', 'fullscreen']);
    windows = windows.filter((w) => !w.incognito && acceptedWindowStates.has(w.state));
    if (windows.length < 2) {
      throw new UserException('Need to have at least two normal windows to move tabs.');
    }
    windows.sort((a, b) => (a.top + a.left) - (b.top + b.left));
    const i = windows.findIndex((w) => w.id == currentTab.windowId);
    if (i == -1) {
      throw new UserException('The current tab is not part of a normal window.');
    }
    const nextWindow = windows[plusMod(i, args.delta || 1, windows.length)];
    let movedTabs = await chrome.tabs.move(tabIds, { index: -1, windowId: nextWindow.id });
    if (!Array.isArray(movedTabs)) movedTabs = [movedTabs];
    await highlightWithRetry(nextWindow.id, movedTabs.map((t) => t.index));
    await chrome.tabs.update(currentTab.id, { active: true });
    await chrome.windows.update(nextWindow.id, { focused: true });
  },
  'moveTab': async (args) => {
    let highlightedTabs = await chrome.tabs.query({ highlighted: true, lastFocusedWindow: true });
    if (highlightedTabs.length === 0) {
      throw new UserException('There is no active or highlighted tab.');
    }
    const delta = args.delta || 1;

    // Mixed selection: Unpin all selected tabs first to allow them to move together.
    const pinnedHighlightedTabs = highlightedTabs.filter((t) => t.pinned);
    if (pinnedHighlightedTabs.length > 0 && pinnedHighlightedTabs.length < highlightedTabs.length) {
      await Promise.all(pinnedHighlightedTabs.map((t) => chrome.tabs.update(t.id, { pinned: false })));
      // Re-query to refresh labels and indices.
      highlightedTabs = await chrome.tabs.query({ highlighted: true, lastFocusedWindow: true });
    }

    let window = await chrome.windows.get(highlightedTabs[0].windowId, { populate: true, windowTypes: ['normal'] });
    if (!window) {
      throw new UserException('Cannot move around tabs in the current window.');
    }

    // Sort to keep relative order.
    highlightedTabs.sort((a, b) => a.index - b.index);

    // Identify the "block" of tabs to move.
    const blockSize = highlightedTabs.length;
    const indices = highlightedTabs.map((t) => t.index);
    const isContiguous = (indices[blockSize - 1] - indices[0] + 1 === blockSize);
    const isBlockPinned = highlightedTabs.every((t) => t.pinned);

    // If the tabs are not contiguous, we bring them together rather than moving them.
    if (!isContiguous) {
      if (delta < 0) {
        // Move left = gather tabs after the first highlighted tabs.
        await chrome.tabs.move(highlightedTabs.map((t) => t.id), { index: indices[0] });
        return;
      }
      // Move right = gather tabs before the last highlighted tabs.
      const targetStartIndex = indices[blockSize - 1] - (blockSize - 1);
      await moveTabsRight(highlightedTabs.map((t) => t.id), targetStartIndex);
      return;
    }

    // Identify movement area (pinned vs unpinned).
    const firstUnpinnedIndex = window.tabs.findLastIndex((t) => t.pinned) + 1;
    const areaOffset = isBlockPinned ? 0 : firstUnpinnedIndex;
    const areaSize = isBlockPinned ? firstUnpinnedIndex : (window.tabs.length - firstUnpinnedIndex);

    // Use right-most for delta > 0, left-most for delta < 0.
    const startIndex = indices[0];
    const nextStartIndex = plusMod(startIndex - areaOffset, delta, areaSize - (blockSize - 1)) + areaOffset;
    if (nextStartIndex > startIndex) {
      await moveTabsRight(highlightedTabs.map((t) => t.id), nextStartIndex);
    } else {
      await chrome.tabs.move(highlightedTabs.map((t) => t.id), { index: nextStartIndex });
    }
  },
  'closeTab': async (args) => {
    await closeTab(args.key, args.layerId);
    await cache.flush();
  },
  'closeTabs': async (args) => {
    await closeTabs(args.layerId);
    await cache.flush();
  },
  'highlight': async (args) => {
    const currentWindow = await chrome.windows.getCurrent({ populate: true, windowTypes: ['normal'] });
    if (currentWindow == null) {
      throw new UserException('There is no active window with tabs.');
    }
    let indexes;
    if (args.variant == 'layer' || args.variant == 'pinned') {
      let entries;
      if (args.variant == 'layer') {
        let layerId;
        if (args?.layerId != null) {
          layerId = args.layerId;
        } else {
          const state = await cache.getState();
          layerId = state.getLayerId();
        }
        entries = await listPins([layerId]);
      } else {
        entries = await listPins();
      }
      const tabIds = entries.map(({ pin }) => pin.tabId)
        .filter((tabId) => tabId != null);
      const tabs = await Promise.all(tabIds.map((tabId) => chrome.tabs.get(tabId)));
      indexes = tabs.filter((tab) => tab.windowId == currentWindow.id)
        .map((tab) => tab.index);
    } else if (args.variant == 'window') {
      indexes = currentWindow.tabs.map((tab) => tab.index);
    } else if (args.variant == 'invert') {
      indexes = currentWindow.tabs.filter((tab) => !tab.highlighted)
        .map((tab) => tab.index);
    } else {
      throw new Error(`Unknown highlight variant: ${args.variant}`);
    }
    if (indexes.length == 0) {
      throw new UserException('No pins to highlight.');
    }
    await chrome.tabs.highlight({ windowId: currentWindow.id, tabs: indexes });
  },
  'toggleTabPinned': async (args) => {
    const highlightedTabs = await chrome.tabs.query({ highlighted: true, lastFocusedWindow: true });
    if (highlightedTabs.length === 0) {
      throw new UserException('There are no highlighted tabs to toggle pinned status.');
    }
    const activeTab = highlightedTabs.find((t) => t.active) || highlightedTabs[0];
    const targetPinnedState = !activeTab.pinned;

    // To maintain relative order: Pin tabs left-to-right. Unpin tabs right-to-left.
    const sortedTabs = [...highlightedTabs].sort((a, b) => a.index - b.index);
    if (!targetPinnedState) {
      sortedTabs.reverse();
    }

    for (const tab of sortedTabs) {
      await chrome.tabs.update(tab.id, { pinned: targetPinnedState });
    }
  },
  'listMetaPatterns': async (args) => {
    const options = await cache.getOptions();
    return options.getMetaPatterns();
  },
  'addMetaPattern': async (args) => {
    const options = await cache.getOptions();
    try {
      new URLPattern(args.pattern);
    } catch {
      throw new UserException(`Invalid URL pattern: ${args.pattern}`);
    }
    options.addMetaPattern(args.pattern);
    await cache.flush();
  },
  'removeMetaPattern': async (args) => {
    const options = await cache.getOptions();
    options.removeMetaPattern(args.index);
    await cache.flush();
  },
  'closeUnpinnedTabs': async (args) => {
    await closeUnpinnedTabs(args.layerId);
    await cache.flush();
  },
  'getPin': async (args) => {
    const layers = await cache.getLayers();
    const layer = layers.getView(args.withoutGlobal ? [args.layerId] : [GLOBAL_LAYER_ID, args.layerId]);
    const ref = layer.findRef(args.key, /*mustExist=*/ true);
    const pin = layers.get(ref);
    return { ref, pin };
  },
  'listPins': async (args) => {
    const layerIds = args.withoutGlobal ? [args.layerId] : [GLOBAL_LAYER_ID, args.layerId]
    const entries = await listPins(layerIds);
    await cache.flush();
    return entries;
  },
  'getActiveKey': async (args) => {
    const [currentTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!currentTab) {
      throw new UserException('There is no active tab.');
    }
    const entry = await findPin(currentTab.id, LAYER_IDS);
    if (!entry) {
      return { keyRef: undefined, tabId: currentTab.id };
    }
    return { keyRef: entry.keyRef, tabId: currentTab.id };
  },
});

chrome.runtime.onMessage.addListener(server.serve.bind(server));

const comboTrie = function() {
  const buildAction = function(descriptor) {
    return async function(parsedArgs) {
      const state = await cache.getState();
      const withDefaultLayerId = function(keyRef) {
        if (keyRef.layerId == null) {
          return {
            layerId: state.data.layerId,
            key: keyRef.key,
          };
        }
        return keyRef;
      };
      const args = descriptor.argTransformer(parsedArgs, withDefaultLayerId);
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
    await cache.flush();
  }
});
