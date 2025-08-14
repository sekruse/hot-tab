import { Server, UserException } from './lpc.js';
import { Cache } from './storage.js';
import combos from './combos.js';
import { LAYER_IDS, GLOBAL_LAYER_ID, HISTORY_KEY } from './keys.js';
const cache = new Cache();

/**
 * Finds the tab linked to the given pin. It might reassociate the pin with a new tab or set the pin as dangling.
 * @param {Object} pin - The pin to work with.
 * @param {Object} keyRef - A reference to the slot the pin is stored at -- so that it can be updated.
 * @returns {?Object} The tab if any could be found.
 */
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
  console.log(`Found ${tabs.length} tabs matching ${pin.urlPattern}`);
  if (tabs.length > 0) {
    const tab = tabs[0];
    pin = {
      ...createPin(tab),
      title: pin.title,
      favIconUrl: pin.favIconUrl,
      url: pin.url,
      urlPattern: pin.urlPattern,
    };
    const layers = await cache.getLayers();
    layers.set(keyRef, pin);
    return tab;
  }
  // If none, mark the pin as dangling.
  delete pin.tabId;
  const layers = await cache.getLayers();
  layers.set(keyRef, pin);
  return null;
}

/**
 * Lists the pins found on the given layers.
 * @param {number[]} layerIds - The IDs of the layers to inspect. Leading layers overlay the following layers.
 * @returns {!Object} An object whose keys are the key codes of the pins and the values are the pins.
 */
async function listPins(layerIds) {
  const layers = await cache.getLayers();
  const layer = layers.getView(layerIds);
  return Promise.all(layer.listEntries().map(async (entry) => {
    await findTab(entry.value, entry.keyRef);
    return { keyRef: entry.keyRef, pin: entry.value };
  }));
}

/**
 * Finds a pin for the given tab in the given layers.
 * @param {number} tabId - ID of the Chrome tab to look for
 * @param {number[]} layerIds - The IDs of the layers to inspect.
 * @returns {?Object} An object with the keyRef and pin if a pin could be found.
 */
async function findPin(tabId, layerIds) {
  for (let i = 0; i < layerIds.length; i++) {
    const layerId = layerIds[i];
    const entries = await listPins([layerId]);
    for (let j = 0; j < entries.length; j++) {
      const entry = entries[j];
      if (entry.keyRef.key === HISTORY_KEY) {
        continue;
      }
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
  entries
    .filter((e) => indexByKeyCode.has(e.keyRef.key))
    .sort((e1, e2) => indexByKeyCode.get(e1.keyRef.key) - indexByKeyCode.get(e2.keyRef.key));
  let curIndex = entries.findIndex((e) => e.pin.tabId == tabId);
  let nextIndex;
  if (curIndex == -1) {
    nextIndex = (shift >= 0) ? 0 : -1;
  } else {
    nextIndex = curIndex + shift;
  }
  nextIndex = (nextIndex + entries.length) % entries.length
  return entries[nextIndex];
}

/**
 * Creates a pin object.
 * @param {Object} The tab to pin.
 * @param {string} options.pinScope - "origin" or "page", depending on which URL pattern the pin should bind to
 * @returns {Object} The pin.
 */
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
    index: tab.index,
    title: tab.title,
    url: tab.url,
    urlPattern: urlPattern,
    favIconUrl: tab.favIconUrl,
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
  let pinnedTab = await findTab(pin, { key, layerId });
  const [currentTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });

  if (pinnedTab === null || options?.recreate) {
    // We need to create a new tab.
    const createOptions = {};
    if (currentTab) {
      createOptions.windowId = currentTab.windowId;
      createOptions.index = currentTab.index + 1;
    } else {
      let window;
      try {
        window = await chrome.windows.getLastFocused();
      } catch (anotherError) {
        // When triggered via shortcuts, there might be no window at all.
        window = await chrome.windows.create({
          type: 'normal',
          focused: true,
        });
      }
      createOptions.windowId = window.id;
    }
    pinnedTab = await chrome.tabs.create({
      url: pin.url,
      ...createOptions,
    });
    pin.tabId = pinnedTab.id;
    pin.index = pinnedTab.index;
    layer.set(key, pin);
  } else {
    // We need to update an existing tab.
    if (options?.reset) {
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
  }

  // Make sure the tab is in the foreground.
  if (!pinnedTab.active) {
    pinnedTab = await chrome.tabs.update(pinnedTab.id, { active: true });
  }
  await chrome.windows.update(pinnedTab.windowId, { focused: true });

  if (currentTab) {
    if (currentTab.url === 'chrome://newtab/') {
      chrome.tabs.remove(currentTab.id);  // fire and forget
    } else {
      layers.set({
        key: HISTORY_KEY,
        layerId: GLOBAL_LAYER_ID,
      }, createPin(currentTab));
    }
  }
}

async function closeTab(key, layerId) {
  const layers = await cache.getLayers();
  const layer = layers.getView([GLOBAL_LAYER_ID, layerId]);
  const pin = layer.get(key);
  if (!pin) {
    throw new UserException(`There is no pin at ${key} in layer ${layerId}.`);
  }
  const pinnedTab = await findTab(pin, { key, layerId });
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
      .filter(({ keyRef }) => (keyRef.key != 'HISTORY_KEY'))
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
    const layer = layers.getView([GLOBAL_LAYER_ID, args.layerId]);
    let key = args.key;
    if (!key) {
      const options = await cache.getOptions();
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
    const pin = createPin(currentTab, args.options);
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
  'closeTab': async (args) => {
    await closeTab(args.key, args.layerId);
    await cache.flush();
  },
  'closeTabs': async (args) => {
    await closeTabs(args.layerId);
    await cache.flush();
  },
  'toggleTabPinned': async (args) => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab) {
      throw new UserException('There is no active tab to pin.');
    }
    await chrome.tabs.update(tab.id, { pinned: !tab.pinned });
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
      throw new UserException(`No pin found for current tab "${currentTab.title}" (${currentTab.url}).`);
    }
    return entry.keyRef;
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
