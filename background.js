import { Server, UserException } from './lpc.js';
import { Cache } from './storage.js';
import combos from './combos.js';
import { LAYER_IDS, GLOBAL_LAYER_ID, HISTORY_KEY } from './keys.js';

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

async function listPins(layerIds) {
  const layers = await cache.getLayers();
  const layer = layers.getView(layerIds);
  const refreshedPins = await Promise.all(layer.listEntries().map(async (entry) => {
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
    layer.set(key, pin);
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
    layers.set({
      key: HISTORY_KEY,
      layerId: GLOBAL_LAYER_ID,
    }, createPin(currentTab));
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
  const pins = await listPins(layerIds);
  await Promise.all(Object.values(pins).map(async (pin) => {
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
  const allPins = await Promise.all(selectedLayerIds.map(async (layerIds) => {
    const pins = await listPins(layerIds);
    delete pins[HISTORY_KEY];
    return pins;
  }));
  const allPinnedTabIds = allPins.map((pins) => {
    return Object.values(pins)
      .filter((pin) => (pin.tabId != null))
      .map((pin) => pin.tabId);
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
    state.setLayerId(args.layerId);
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
    const layers = await cache.getLayers();
    const layer = layers.getView([GLOBAL_LAYER_ID, args.layerId]);
    const pin = createPin(currentTab, args.options);
    const layerId = layer.set(args.key, pin);
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
  'closeTab': async (args) => {
    await closeTab(args.key, args.layerId);
    await cache.flush();
  },
  'closeTabs': async (args) => {
    await closeTabs(args.layerId);
    await cache.flush();
  },
  'closeUnpinnedTabs': async (args) => {
    await closeUnpinnedTabs(args.layerId);
    await cache.flush();
  },
  'listPins': async (args) => {
    const layerIds = args.withoutGlobal ? [args.layerId] : [GLOBAL_LAYER_ID, args.layerId]
    const pins = await listPins(layerIds);
    await cache.flush();
    return pins;
  },
  'getActiveKey': async (args) => {
    const [currentTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!currentTab) {
      throw new UserException('There is no active tab.');
    }
    for (let i = 0; i < LAYER_IDS.length; i++) {
      const layerId = LAYER_IDS[i];
      const pins = await listPins([layerId]);
      const keys = Object.keys(pins);
      for (let j = 0; j < keys.length; j++) {
        const key = keys[j];
        if (key === HISTORY_KEY) {
          continue;
        }
        const pin = pins[key];
        if (pin.tabId === currentTab.id) {
          return { key, layerId };
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
