import { UserException } from './lpc.js';

export const keyCodeToHTML = (() => {
  const cs = new Map();
  cs.set('Minus', '-');
  cs.set('Equal', '=');
  cs.set('LeftBracket', '[');
  cs.set('RightBracket', ']');
  cs.set('Backslash', '\\');
  cs.set('Backspace', '&#9003;');
  cs.set('Semicolon', ';');
  cs.set('Quote', "'");
  cs.set('Comma', ",");
  cs.set('Period', ".");
  cs.set('Slash', "/");
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach((ch) => cs.set(`Key${ch}`, ch));
  '1234567890'.split('').forEach((d) => cs.set(`Digit${d}`, d));
  return cs;
})();
const htmlToKeyCode = new Map(keyCodeToHTML.entries().map(([k, v]) => [v, k]));

export function isModifier(keyCode) {
  return keyCode.match(/^((Shift|Control|Alt|Meta)(Left|Right)|CapsLock)$/) ? true : false;
}

export function createIcon(pin, extraClasses) {
  const iconFallback = document.createElement('div');
  iconFallback.classList.add('icon-fallback');
  if (extraClasses) {
    for (let cls of extraClasses) {
      iconFallback.classList.add(cls);
    }
  }
  iconFallback.classList.toggle('icon-inactive', !pin.tabId);
  iconFallback.innerText = `${pin.title[0]}${pin.title[1]}`;
  if (!pin.favIconUrl) {
    return iconFallback;
  }
  const icon = document.createElement('img');
  icon.classList.add('icon');
  if (extraClasses) {
    for (let cls of extraClasses) {
      icon.classList.add(cls);
    }
  }
  icon.classList.toggle('icon-inactive', !pin.tabId);
  icon.addEventListener('error', (event) => {
    icon.replaceWith(iconFallback);
  });
  icon.setAttribute('src', pin.favIconUrl)
  return icon;
}

export function parseDigitKeycode(keycode) {
  const match = keycode.match(/^Digit(\d)$/);
  if (!match) {
    return { exists: false };
  }
  return { exists: true, value: Number(match[1]) };
}

// Special character in key combinations to represent a key ref (<key> or <digit><key>).
const COMBO_ARG_KEY_REF = '@';

// A ComboTrie stores key combinations in a trie and associates them with actions.
export class ComboTrie {
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
    let stagingKeyRef = {};
    const keyRefs = [];
    for (let i = 0; i < input.length; i++) {
      const char = input[i];
      if (COMBO_ARG_KEY_REF in node) {
        if (char.match(/\d/)) {
          if (stagingKeyRef.keysetId != null) {
            throw new UserException(`Multiple keyset IDs in ${input}.`);
          }
          stagingKeyRef.keysetId = Number.parseInt(char);
          continue;
        }
        if (char.match(/[a-zA-Z\[\]\\;',./]/)) {
          if (stagingKeyRef.key != null) {
            throw new UserException(`Multiple keys in ${input}.`);
          }
          stagingKeyRef.key = htmlToKeyCode.get(char.toUpperCase());
          keyRefs.push(stagingKeyRef);
          stagingKeyRef = {};
          node = node[COMBO_ARG_KEY_REF];
          continue;
        }
      }
      if (char in node) {
        node = node[char];
        continue;
      }
      throw new UserException(`Unexpected character at position ${i} in "${input}".`);
    }
    if (node.action) {
      return {
        action: node.action,
        keyRefs: keyRefs,
      };
    }
    return null;
  }
}

