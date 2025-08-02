import { UserException } from './lpc.js';
import { LAYER_IDS } from './keys.js';

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
};

export class Cache {
  constructor() {
    this.state = null;
    this.layers = null;
    this.options = null;
  }
  async getState() {
    if (this.state === null) {
      const loaded = await chrome.storage.local.get('state');
      this.state = new State(loaded.state);
    }
    return this.state;
  }
  async getLayers() {
    if (this.layers === null) {
      const loaded = await chrome.storage.local.get('keysets');
      this.layers = new Layers(loaded.keysets);
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
    await Promise.all(p);
  }
}

class State {
  constructor(data) {
    this.data = {...defaultState, ...data};
    this.dirty = false;
  }
  getLayerId() {
    return this.data.layerId;
  }
  setLayerId(layerId) {
    this.data.layerId = layerId;
    this.dirty = true;
  }
  async flush() {
    if (this.dirty) {
      await chrome.storage.local.set({'state': this.data});
      this.dirty = false;
    }
  }
}

class Layers {
  constructor(data) {
    this.data = {...defaultLayers, ...data};
    this.dirty = false;
  }
  set(keyRef, val) {
    this.data[keyRef.layerId][keyRef.key] = val;
    this.dirty = true;
  }
  get(keyRef) {
    return this.data[keyRef.layerId][keyRef.key];
  }
  remove(keyRef) {
    if (!(keyRef.key in this.data[keyRef.layerId])) {
      throw new UserException(`No pin for ${keyRef.key} at layer ${keyRef.layerId}.`);
    }
    delete this.data[keyRef.layerId][keyRef.key];
    this.dirty = true;
  }
  getView(layerIds) {
    return new Layer(this, layerIds);
  }
  async flush() {
    if (this.dirty) {
      await chrome.storage.local.set({'keysets': this.data});
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
        if (key in effectiveLayer) {
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
    this.data = {...defaultOptions, ...data};
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
  async flush() {
    if (this.dirty) {
      await chrome.storage.local.set({'options': this.data});
      this.dirty = false;
    }
  }
}
