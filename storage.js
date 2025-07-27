import { UserException } from './lpc.js';
import { KEYSET_IDS } from './keys.js';

const defaultState = {
  keysetId: 1,
};

const defaultKeysets = KEYSET_IDS.reduce((acc, val) => {
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
    this.keysets = null;
    this.options = null;
  }
  async getState() {
    if (this.state === null) {
      const loaded = await chrome.storage.local.get('state');
      this.state = new State(loaded.state);
    }
    return this.state;
  }
  async getKeysets() {
    if (this.keysets === null) {
      const loaded = await chrome.storage.local.get('keysets');
      this.keysets = new Keysets(loaded.keysets);
    }
    return this.keysets;
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
    if (this.keysets) {
      p.push(this.keysets.flush());
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
  getKeysetId() {
    return this.data.keysetId;
  }
  setKeysetId(keysetId) {
    this.data.keysetId = keysetId;
    this.dirty = true;
  }
  async flush() {
    if (this.dirty) {
      await chrome.storage.local.set({'state': this.data});
      this.dirty = false;
    }
  }
}

class Keysets {
  constructor(data) {
    this.data = {...defaultKeysets, ...data};
    this.dirty = false;
  }
  set(keyRef, val) {
    this.data[keyRef.keysetId][keyRef.key] = val;
    this.dirty = true;
  }
  get(keyRef) {
    return this.data[keyRef.keysetId][keyRef.key];
  }
  remove(keyRef) {
    if (!(keyRef.key in this.data[keyRef.keysetId])) {
      throw new UserException(`No pin for ${keyRef.key} at keyset ${keyRef.keysetId}.`);
    }
    delete this.data[keyRef.keysetId][keyRef.key];
    this.dirty = true;
  }
  getView(keysetIds) {
    return new Keyset(this, keysetIds);
  }
  async flush() {
    if (this.dirty) {
      await chrome.storage.local.set({'keysets': this.data});
      this.dirty = false;
    }
  }
}

class Keyset {
  constructor(keysets, keysetIds) {
    this.keysets = keysets;
    this.keysetIds = Array.isArray(keysetIds) ? keysetIds : [keysetIds];
  }
  findRef(key, mustExist) {
    const ref = { key };
    for (let i = 0; i < this.keysetIds.length; i++) {
      ref.keysetId = this.keysetIds[i];
      const val = this.keysets.get(ref);
      if (val != null) {
        return ref;
      }
    }
    if (mustExist) {
      throw new UserException(`There is no pin for ${key} in keyset(s) ${this.keysetIds.join(", ")}.`);
    }
    return ref;
  }
  // Associates the value with the key in the first keyset that already has a value.
  // Otherwise, the key from the last keyset is associated with the value.
  // Returns the ID of the keyset where the key was associated with the value.
  set(key, val) {
    const ref = this.findRef(key);
    this.keysets.set(ref, val);
    return ref.keysetId;
  }
  get(key) {
    const ref = this.findRef(key);
    return this.keysets.get(ref);
  }
  listEntries() {
    const entries = [];
    let effectiveKeyset = {};
    for (let i = 0; i < this.keysetIds.length; i++) {
      const keysetId = this.keysetIds[i];
      const keysetData = this.keysets.data[keysetId];
      for (const key in keysetData) {
        if (key in effectiveKeyset) {
          continue;
        }
        effectiveKeyset[key] = keysetData[key];
        entries.push({
          keyRef: { keysetId, key },
          value: keysetData[key],
        });
      }
    }
    return entries;
  }
  // Clears the key at the first keyset that has that key set.
  // Returns the ID of the keyset where the key has been cleared.
  remove(key) {
    const ref = this.findRef(key, /*mustExist=*/true);
    this.keysets.remove(ref);
    return ref.keysetId;
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
