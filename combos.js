import { keysByInputChar } from './keys.js';
import { UserException } from './lpc.js';

// Special character in key combinations to represent a key ref (<key> or <digit><key>).
const COMBO_ARG_KEY_REF = '@';
const COMBO_ARG_LAYER = '#';

// A ComboTrie stores key combinations in a trie and associates them with actions.
class ComboTrie {
  constructor() {
    this.root = {};
  }
  // Inserts the combination into the trie and associates a value with it.
  addCombo(code, action) {
    let node = this.root;
    for (let i = 0; i < code.length; i++) {
      const char = code[i];
      if (char in node) {
        node = node[char];
      } else {
        const child = {};
        node[char] = child;
        node = child;
      }
    }
    node.action = action;
  }
  // Attempts to match the input against all registered combos.
  // If a combo has been matched, this method returns the registered value and parsed key ref.
  // If no combo has been completed yet, `null` is returned.
  // If no combo matches the input, an exception is raised.
  match(input) {
    let node = this.root;
    let keyRefBuilder = {};
    const args = [];
    for (let i = 0; i < input.length; i++) {
      const char = input[i];
      if (COMBO_ARG_KEY_REF in node) {
        if (char.match(/\d/)) {
          if (keyRefBuilder.layerId != null) {
            throw new UserException(`Multiple layer IDs in ${input}.`);
          }
          keyRefBuilder.layerId = Number.parseInt(char);
          continue;
        }
        if (char.match(/[a-zA-Z\[\]\\;',./\<]/)) {
          if (keyRefBuilder.key != null) {
            throw new UserException(`Multiple keys in ${input}.`);
          }
          keyRefBuilder.key = keysByInputChar.get(char.toUpperCase()).keyCode;
          args.push(keyRefBuilder);
          keyRefBuilder = {};
          node = node[COMBO_ARG_KEY_REF];
          continue;
        }
      } else if (COMBO_ARG_LAYER in node) {
        if (char.match(/\d/)) {
          const layerId = Number.parseInt(char);
          args.push({ layerId });
          node = node[COMBO_ARG_LAYER];
          continue;
        }
      } if (char in node) {
        node = node[char];
        continue;
      }
      throw new UserException(`Unexpected character at position ${i} in "${input}".`);
    }
    if (node.action) {
      return {
        action: node.action,
        args: args,
      };
    }
    return null;
  }
}


const defaultComboDescriptors = function() {
  const combos = new Array();
  combos.push({
    sequence: 'g@',
    descriptor: {
      method: 'focusTab',
      argTransformer: ([keyRef], withDefaultLayerId) => withDefaultLayerId(keyRef),
      closePopup: true,
    },
  });
  combos.push({
    sequence: 'G@',
    descriptor: {
      method: 'focusTab',
      argTransformer: function([keyRef], withDefaultLayerId) {
        return { ...withDefaultLayerId(keyRef), options: { summon: true } };
      },
      closePopup: true,
    },
  });
  combos.push({
    sequence: 'f@',
    descriptor: {
      method: 'focusTab',
      argTransformer: function([keyRef], withDefaultLayerId) {
        return { ...withDefaultLayerId(keyRef), options: { recreate: true } };
      },
      closePopup: true,
    },
  });
  combos.push({
    sequence: 'r@',
    descriptor: {
      method: 'focusTab',
      argTransformer: function([keyRef], withDefaultLayerId) {
        return { ...withDefaultLayerId(keyRef), options: { reset: true } };
      },
      closePopup: true,
    },
  });
  combos.push({
    sequence: 'k#',
    descriptor: {
      method: 'setActiveLayerId',
      argTransformer: ([partialKeyRef], withDefaultLayerId) => partialKeyRef,
    },
  });
  combos.push({
    sequence: 'kk',
    descriptor: {
      method: 'setActiveLayerId',
      argTransformer: function() { return {}; },
    },
  });
  combos.push({
    sequence: 'x@',
    descriptor: {
      method: 'closeTab',
      argTransformer: ([keyRef], withDefaultLayerId) => withDefaultLayerId(keyRef),
    },
  });
  combos.push({
    sequence: 'X#',
    descriptor: {
      method: 'closeTabs',
      argTransformer: ([partialKeyRef], withDefaultLayerId) => withDefaultLayerId(partialKeyRef),
    },
  });
  combos.push({
    sequence: 'XX',
    descriptor: {
      method: 'closeTabs',
      argTransformer: (noArgs, withDefaultLayerId) => withDefaultLayerId({}),
    },
  });
  combos.push({
    sequence: 'y#',
    descriptor: {
      method: 'closeUnpinnedTabs',
      argTransformer: ([partialKeyRef], withDefaultLayerId) => withDefaultLayerId(partialKeyRef),
    },
  });
  combos.push({
    sequence: 'yy',
    descriptor: {
      method: 'closeUnpinnedTabs',
      argTransformer: (noArgs, withDefaultLayerId) => withDefaultLayerId({}),
    },
  });
  combos.push({
    sequence: 'ya',
    descriptor: {
      method: 'closeUnpinnedTabs',
      argTransformer: (noArgs, withDefaultLayerId) => noArgs,
    },
  });
  combos.push({
    sequence: 'm@@',
    descriptor: {
      method: 'updatePin',
      argTransformer: function([srcKeyRef, dstKeyRef], withDefaultLayerId) {
        return {
          ...withDefaultLayerId(srcKeyRef),
          updates: withDefaultLayerId(dstKeyRef),
          swap: true,
        };
      },
    },
  });
  combos.push({
    sequence: 'M@@',
    descriptor: {
      method: 'updatePin',
      argTransformer: function([srcKeyRef, dstKeyRef], withDefaultLayerId) {
        return {
          ...withDefaultLayerId(srcKeyRef),
          updates: withDefaultLayerId(dstKeyRef),
        };
      },
    },
  });
  combos.push({
    sequence: 'd@',
    descriptor: {
      method: 'removePin',
      argTransformer: ([keyRef], withDefaultLayerId) => withDefaultLayerId(keyRef),
    },
  });
  combos.push({
    sequence: 'D#',
    descriptor: {
      method: 'clearLayer',
      argTransformer: ([partialKeyRef], withDefaultLayerId) => partialKeyRef,
    },
  });
  combos.push({
    sequence: 'DD',
    descriptor: {
      method: 'clearLayer',
      argTransformer: (noArgs, withDefaultLayerId) => withDefaultLayerId({}),
    },
  });
  combos.push({
    sequence: 'p@',
    descriptor: {
      method: 'pinTab',
      argTransformer: function([keyRef], withDefaultLayerId) {
        return { ...withDefaultLayerId(keyRef), options: { pinScope: 'origin' } };
      },
      closePopup: true,
    },
  });
  combos.push({
    sequence: 'P@',
    descriptor: {
      method: 'pinTab',
      argTransformer: function([keyRef], withDefaultLayerId) {
        return { ...withDefaultLayerId(keyRef), options: { pinScope: 'page' } };
      },
      closePopup: true,
    },
  });
  combos.push({
    sequence: ';#',
    descriptor: {
      method: 'pinTab',
      argTransformer: ([partialKeyRef]) => { return { ...partialKeyRef, options: { pinScope: 'page' } }; },
      closePopup: true,
    },
  });
  combos.push({
    sequence: ';;',
    descriptor: {
      method: 'pinTab',
      argTransformer: (_, withDefaultLayerId) => withDefaultLayerId({ options: { pinScope: 'page' } }),
      closePopup: true,
    },
  });
  combos.push({
    sequence: 'cp',
    descriptor: {
      method: 'toggleTabPinned',
      argTransformer: function() { return {}; },
      closePopup: true,
    },
  })
  return combos;
}();

function createDefaultComboTrie(buildAction) {
  const trie = new ComboTrie();
  defaultComboDescriptors.forEach((c) => {
    trie.addCombo(c.sequence, buildAction(c.descriptor));
  });
  return trie
}

export default {
  createDefaultTrie: createDefaultComboTrie,
};
