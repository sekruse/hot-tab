const defaultState = {
  keysetId: 1,
};

const defaultKeysets = Array(10).keys().reduce((acc, val) => {
  acc[val] = {};
  return acc;
}, []);

export class Cache {
  constructor() {
    this.state = null;
    this.keysets = null;
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
  async flush() {
    let p = [];
    if (this.state) {
      p.push(this.state.flush());
    }
    if (this.keysets) {
      p.push(this.keysets.flush());
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
  set(keysetId, key, val) {
    this.data[keysetId][key] = val;
    this.dirty = true;
  }
  get(keysetId, key) {
    return this.data[keysetId][key];
  }
  getKeys(keysetId) {
    return Object.keys(this.data[keysetId]);
  }
  remove(keysetId, key) {
    delete this.data[keysetId][key];
    this.dirty = true;
  }
  async flush() {
    if (this.dirty) {
      await chrome.storage.local.set({'keysets': this.data});
      this.dirty = false;
    }
  }
}
