import { htmlToKeyCode } from './keys.js';
import { UserException } from './lpc.js';

// Special character in key combinations to represent a key ref (<key> or <digit><key>).
const COMBO_ARG_KEY_REF = '@';
const COMBO_ARG_KEYSET = '#';

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
          if (keyRefBuilder.keysetId != null) {
            throw new UserException(`Multiple keyset IDs in ${input}.`);
          }
          keyRefBuilder.keysetId = Number.parseInt(char);
          continue;
        }
        if (char.match(/[a-zA-Z\[\]\\;',./]/)) {
          if (keyRefBuilder.key != null) {
            throw new UserException(`Multiple keys in ${input}.`);
          }
          keyRefBuilder.key = htmlToKeyCode.get(char.toUpperCase());
          args.push(keyRefBuilder);
          keyRefBuilder = {};
          node = node[COMBO_ARG_KEY_REF];
          continue;
        }
      } else if (COMBO_ARG_KEYSET in node) {
        if (char.match(/\d/)) {
          const keysetId = Number.parseInt(char);
          args.push({ keysetId });
          node = node[COMBO_ARG_KEYSET];
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
      argTransformer: ([keyRef], withDefaultKeysetId) => withDefaultKeysetId(keyRef),
      closePopup: true,
    },
  });
  combos.push({
    sequence: 'G@',
    descriptor: {
      method: 'focusTab',
      argTransformer: function([keyRef], withDefaultKeysetId) {
        return { ...withDefaultKeysetId(keyRef), options: { summon: true }};
      },
      closePopup: true,
    },
  });
  combos.push({
    sequence: 'f@',
    descriptor: {
      method: 'focusTab',
      argTransformer: function([keyRef], withDefaultKeysetId) {
        return { ...withDefaultKeysetId(keyRef), options: { recreate: true }};
      },
      closePopup: true,
    },
  });
  combos.push({
    sequence: 'r@',
    descriptor: {
      method: 'focusTab',
      argTransformer: function([keyRef], withDefaultKeysetId) {
        return { ...withDefaultKeysetId(keyRef), options: { reset: true }};
      },
      closePopup: true,
    },
  });
  combos.push({
    sequence: 'k#',
    descriptor: {
      method: 'setActiveKeysetId',
      argTransformer: ([partialKeyRef], withDefaultKeysetId) => partialKeyRef,
    },
  });
  combos.push({
    sequence: 'x@',
    descriptor: {
      method: 'closeTab',
      argTransformer: ([keyRef], withDefaultKeysetId) => withDefaultKeysetId(keyRef),
    },
  });
  combos.push({
    sequence: 'X#',
    descriptor: {
      method: 'closeTabs',
      argTransformer: ([partialKeyRef], withDefaultKeysetId) => withDefaultKeysetId(keyRef),
    },
  });
  combos.push({
    sequence: 'XX',
    descriptor: {
      method: 'closeTabs',
      argTransformer: (noArgs, withDefaultKeysetId) => withDefaultKeysetId({}),
    },
  });
  combos.push({
    sequence: 'm@@',
    descriptor: {
      method: 'updatePin',
      argTransformer: function([srcKeyRef, dstKeyRef], withDefaultKeysetId) {
        return {
          ...withDefaultKeysetId(srcKeyRef),
          updates: withDefaultKeysetId(dstKeyRef),
        };
      },
    },
  });
  combos.push({
    sequence: 'd@',
    descriptor: {
      method: 'removePin',
      argTransformer: ([keyRef], withDefaultKeysetId) => withDefaultKeysetId(keyRef),
    },
  });
  combos.push({
    sequence: 'D#',
    descriptor: {
      method: 'clearKeyset',
      argTransformer: ([partialKeyRef], withDefaultKeysetId) => partialKeyRef,
    },
  });
  combos.push({
    sequence: 'DD',
    descriptor: {
      method: 'clearKeyset',
      argTransformer: (noArgs, withDefaultKeysetId) => withDefaultKeysetId({}),
    },
  });
  combos.push({
    sequence: 'p@',
    descriptor: {
      method: 'pinTab',
      argTransformer: function([keyRef], withDefaultKeysetId) {
        return { ...withDefaultKeysetId(keyRef), options: { pinScope: 'origin' }};
      },
      closePopup: true,
    },
  });
  combos.push({
    sequence: 'P@',
    descriptor: {
      method: 'pinTab',
      argTransformer: function([keyRef], withDefaultKeysetId) {
        return { ...withDefaultKeysetId(keyRef), options: { pinScope: 'page' }};
      },
      closePopup: true,
    },
  });
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
