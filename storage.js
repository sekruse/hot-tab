import { UserException } from './lpc.js';
import { LAYER_IDS, keysByInputChar } from './keys.js';

const defaultState = {
  layerId: 1,
};

const defaultLayers = LAYER_IDS.reduce((acc, val) => {
  acc[val] = {};
  return acc;
}, []);

const defaultOptions = {
  commandCombos: {
    "command-01": "ga",
    "command-02": "gs",
    "command-03": "gd",
    "command-04": "gf",
    "command-05": "",
    "command-06": "",
    "command-07": "",
    "command-08": "",
    "command-09": "",
    "command-10": "",
    "command-11": "",
    "command-12": "",
    "command-13": "",
    "command-14": "",
    "command-15": "",
    "command-16": "",
    "command-17": "",
    "command-18": "",
    "command-19": "",
    "command-20": "",
    "command-21": "",
    "command-22": "",
    "command-23": "",
    "command-24": "",
    "command-25": "",
    "command-26": "",
    "command-27": "",
    "command-28": "",
    "command-29": "",
    "command-30": "",
  },
  keyOrder: "ASDFGZXCVB",
  metaPatterns: [
    "https://docs.google.com/:type/d/:docid/*",
    "https://github.com/:org/:repo/*",
  ],
};

const defaultLayerConfigs = LAYER_IDS.reduce((acc, val) => {
  acc[val] = { name: '' };
  return acc;
}, []);

export class Cache {
  constructor() {
    this.state = null;
    this.layers = null;
    this.options = null;
    this.layerConfigs = null;
    this.tabHistory = null;
    this.pinChangedListeners = [];
    this.layerChangedListeners = [];
  }
  async getState() {
    if (this.state === null) {
      const loaded = await chrome.storage.local.get('state');
      this.state = new State(loaded.state, this);
    }
    return this.state;
  }
  async getLayers() {
    if (this.layers === null) {
      const loaded = await chrome.storage.local.get('keysets');
      this.layers = new Layers(loaded.keysets, this);
    }
    return this.layers;
  }
  async getOptions() {
    if (this.options === null) {
      const loaded = await chrome.storage.local.get('options');
      this.options = new Options(loaded.options);
    }
    return this.options;
  }
  /**
    * Loads and returns the layer configurations.
    * @returns {Promise<LayerConfigs>} The layer configurations.
    */
   async getLayerConfigs() {
     if (this.layerConfigs === null) {
       const loaded = await chrome.storage.local.get('layerConfigs');
       this.layerConfigs = new LayerConfigs(loaded.layerConfigs);
     }
     return this.layerConfigs;
   }
   async getTabHistory() {
     if (this.tabHistory === null) {
       const loaded = await chrome.storage.local.get('tabHistory');
       this.tabHistory = new TabHistory(loaded.tabHistory, this);
     }
     return this.tabHistory;
   }
  addPinChangedListener(listener) {
    this.pinChangedListeners.push(listener);
  }
  addLayerChangedListener(listener) {
    this.layerChangedListeners.push(listener);
  }
  async flush() {
    let p = [];
    if (this.state) {
      p.push(this.state.flush());
    }
    if (this.layers) {
      p.push(this.layers.flush());
    }
    if (this.options) {
      p.push(this.options.flush());
    }
    if (this.layerConfigs) {
      p.push(this.layerConfigs.flush());
    }
    if (this.tabHistory) {
      p.push(this.tabHistory.flush());
    }
    await Promise.all(p);
  }
}

class State {
  constructor(data, cache) {
    this.data = { ...defaultState, ...data };
    this.cache = cache;
    this.dirty = false;
  }
  getLayerId() {
    return this.data.layerId;
  }
  setLayerId(layerId) {
    this.data.layerId = layerId;
    this.dirty = true;
    for (let i = 0; i < this.cache.layerChangedListeners.length; i++) {
      const listener = this.cache.layerChangedListeners[i];
      listener(layerId);
    }
  }
  async flush() {
    if (this.dirty) {
      await chrome.storage.local.set({ 'state': this.data });
      this.dirty = false;
    }
  }
}

class Layers {
  constructor(data, cache) {
    this.data = { ...defaultLayers, ...data };
    this.cache = cache;
    this.dirty = false;
  }
  set(keyRef, val) {
    this.data[keyRef.layerId][keyRef.key] = val;
    this.dirty = true;
    for (let i = 0; i < this.cache.pinChangedListeners.length; i++) {
      const listener = this.cache.pinChangedListeners[i];
      listener(keyRef, val, 'SET');
    }
  }
  get(keyRef) {
    return this.data[keyRef.layerId][keyRef.key];
  }
  remove(keyRef) {
    if (!(keyRef.key in this.data[keyRef.layerId])) {
      throw new UserException(`No pin for ${keyRef.key} at layer ${keyRef.layerId}.`);
    }
    const val = this.data[keyRef.layerId][keyRef.key];
    delete this.data[keyRef.layerId][keyRef.key];
    this.dirty = true;
    for (let i = 0; i < this.cache.pinChangedListeners.length; i++) {
      const listener = this.cache.pinChangedListeners[i];
      listener(keyRef, val, 'DELETE');
    }
  }
  getView(layerIds) {
    return new Layer(this, layerIds);
  }
  listAllEntries() {
    return LAYER_IDS.flatMap(l => this.getView([l]).listEntries());
  }
  async flush() {
    if (this.dirty) {
      await chrome.storage.local.set({ 'keysets': this.data });
      this.dirty = false;
    }
  }
}

class Layer {
  constructor(layers, layerIds) {
    this.layers = layers;
    this.layerIds = Array.isArray(layerIds) ? layerIds : [layerIds];
  }
  findRef(key, mustExist) {
    const ref = { key };
    for (let i = 0; i < this.layerIds.length; i++) {
      ref.layerId = this.layerIds[i];
      const val = this.layers.get(ref);
      if (val != null) {
        return ref;
      }
    }
    if (mustExist) {
      throw new UserException(`There is no pin for ${key} in layer(s) ${this.layerIds.join(", ")}.`);
    }
    return ref;
  }
  // Associates the value with the key in the first layer that already has a value.
  // Otherwise, the key from the last layer is associated with the value.
  // Returns the ID of the layer where the key was associated with the value.
  set(key, val) {
    const ref = this.findRef(key);
    this.layers.set(ref, val);
    return ref.layerId;
  }
  get(key) {
    const ref = this.findRef(key);
    return this.layers.get(ref);
  }
  listEntries() {
    const entries = [];
    let effectiveLayer = {};
    for (let i = 0; i < this.layerIds.length; i++) {
      const layerId = this.layerIds[i];
      const layerData = this.layers.data[layerId];
      for (const key in layerData) {
        if (layerData[key] == null || key in effectiveLayer) {
          continue;
        }
        effectiveLayer[key] = layerData[key];
        entries.push({
          keyRef: { layerId, key },
          value: layerData[key],
        });
      }
    }
    return entries;
  }
  // Clears the key at the first layer that has that key set.
  // Returns the ID of the layer where the key has been cleared.
  remove(key) {
    const ref = this.findRef(key, /*mustExist=*/true);
    this.layers.remove(ref);
    return ref.layerId;
  }
}

class Options {
  constructor(data) {
    this.data = { ...defaultOptions, ...data };
    this.dirty = false;
  }
  listCommandCombos() {
    return this.data.commandCombos;
  }
  getCommandCombo(command) {
    return this.data.commandCombos[command];
  }
  setCommandCombo(command, combo) {
    this.data.commandCombos[command] = combo;
    this.dirty = true;
  }
  setKeyOrder(inputChars) {
    if (!inputChars) {
      throw new UserException("No key order provided.");
    }
    const duplicateChecker = new Set();
    for (let i = 0; i < inputChars.length; i++) {
      const ch = inputChars.charAt(i);
      if (!keysByInputChar.has(ch)) {
        throw new UserException(`Not a valid character for the key order: ${ch}`);
      }
      if (duplicateChecker.has(ch)) {
        throw new UserException(`Character appears twice: ${ch}`);
      }
      duplicateChecker.add(ch);
    }
    this.data.keyOrder = inputChars;
    this.dirty = true;
  }
  getKeyOrder() {
    return this.data.keyOrder.split('').reduce(
      (agg, val) => {
        agg.push(keysByInputChar.get(val));
        return agg;
      }, []);
  }
  getKeyOrderIndexedByKeyCode() {
    return this.getKeyOrder().reduce((acc, val, idx) => acc.set(val.keyCode, idx), new Map());
  }
  getMetaPatterns() {
    return this.data.metaPatterns || [];
  }
  setMetaPatterns(patterns) {
    this.data.metaPatterns = patterns;
    this.dirty = true;
  }
  addMetaPattern(pattern) {
    if (!this.data.metaPatterns) {
      this.data.metaPatterns = [];
    }
    this.data.metaPatterns.push(pattern);
    this.dirty = true;
  }
  removeMetaPattern(index) {
    if (!this.data.metaPatterns) {
      throw new UserException("No URL pattern at index " + index);
    }
    this.data.metaPatterns.splice(index, 1);
    this.dirty = true;
  }
  async flush() {
    if (this.dirty) {
      await chrome.storage.local.set({ 'options': this.data });
      this.dirty = false;
    }
  }
}

/**
 * Manages layer-specific configurations.
 */
class LayerConfigs {
  /**
   * @param {Object[]} data - Initial data for layer configurations.
   */
  constructor(data) {
    this.data = LAYER_IDS.reduce((acc, val) => {
      acc[val] = { ...defaultLayerConfigs[val], ...data?.[val] };
      return acc;
    }, []);
    this.dirty = false;
  }
  /**
   * Gets the configuration for a specific layer.
   * @param {number} layerId - The ID of the layer.
   * @returns {Object} The layer configuration.
   */
  get(layerId) {
    return this.data[layerId];
  }
  /**
   * Updates the configuration for a specific layer. This needs to be called also when the config object has been changed
   * to persist those changes.
   * @param {number} layerId - The ID of the layer.
   * @param {Object} config - The partial configuration to update.
   */
  set(layerId, config) {
    this.data[layerId] = { ...this.data[layerId], ...config };
    this.dirty = true;
  }
 /**
    * Flushes the current configuration to persistent storage.
    */
   async flush() {
     if (this.dirty) {
       await chrome.storage.local.set({ 'layerConfigs': this.data });
       this.dirty = false;
     }
   }
 }

 export const MAX_HISTORY_ENTRIES = 100;

  export function isIgnoredInHistory(url) {
    console.log('Checking', url);
    return !url || url.startsWith('chrome://new') || url === 'about:blank';
  }

  /**
   * Manages tab navigation history.
   */
  class TabHistory {
     constructor(data, cache) {
      this.data = {
        entries: data?.entries || [],
      };
      this.cache = cache;
      this.dirty = false;
    }
    /**
     * Finds the index of the entry with the given tabId, or -1 if not found.
     */
    findPosition(tabId) {
      for (let i = 0; i < this.data.entries.length; i++) {
        if (this.data.entries[i].tabId === tabId) {
          return i;
        }
      }
      return -1;
    }
    push(entry) {
      if (isIgnoredInHistory(entry.url)) return;
      this.data.entries = this.data.entries.filter((e) => e.tabId !== entry.tabId);
      this.data.entries.push(entry);

      // Cap size
      if (this.data.entries.length > MAX_HISTORY_ENTRIES) {
        this.data.entries.shift();
      }

      this.dirty = true;
    }
    /**
     * Updates all entries according to the given function (entry) => newEntry.
     * If the function returns `null`, then no update is performed.
     * @param {function} fn - The update function.
     */
    update(fn) {
      for (let i = 0; i < this.data.entries.length; i++) {
        const newEntry = fn(this.data.entries[i]);
        if (newEntry != null) {
          if (isIgnoredInHistory(newEntry.url)) {
            this.data.entries.splice(i, 1);
            this.dirty = true;
            i--;
            continue;
          }
          this.data.entries[i] = newEntry;
          this.dirty = true;
        }
      }
    }
    /**
     * Gets the entry at the given position.
     */
    getEntry(position) {
      if (position < 0 || position >= this.data.entries.length) {
        return null;
      }
      return this.data.entries[position];
    }
    /**
     * Sets the entry at the given position.
     */
    setEntry(position, entry) {
      this.data.entries[position] = entry;
      this.dirty = true;
    }
    clear() {
      this.data.entries = [];
      this.dirty = true;
    }
    async flush() {
      if (this.dirty) {
        await chrome.storage.local.set({ 'tabHistory': this.data });
        this.dirty = false;
      }
    }
  }
