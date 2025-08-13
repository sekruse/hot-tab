export const GLOBAL_LAYER_ID = 0;
export const LAYER_IDS = Array(10).keys().toArray();
export const HISTORY_KEY = 'Backspace';
const ORDERED_INPUT_CHARS = 'ASDFGZXCVB';

class Key {
  constructor(keyCode, char, inputChar, html) {
    this.keyCode = keyCode;
    this.char = char;
    this.inputChar = inputChar ? inputChar : char;
    this.html = html ? html : char;
  }
}

const keys = function() {
  const k = [];
  // k.push(new Key('Minus', '-'));
  // k.push(new Key('Equal', '='));
  k.push(new Key('LeftBracket', '['));
  k.push(new Key('RightBracket', ']'));
  k.push(new Key('Backslash', '\\'));
  k.push(new Key('Backspace', '⌫', '<', '&#9003;'));
  k.push(new Key('Semicolon', ';'));
  k.push(new Key('Quote', "'"));
  k.push(new Key('Comma', ","));
  k.push(new Key('Period', "."));
  k.push(new Key('Slash', "/"));
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach((ch) => k.push(new Key(`Key${ch}`, ch)));
  '1234567890'.split('').forEach((d) => k.push(new Key(`Digit${d}`, d)));
  return k;
}();

export const keysByKeyCode = keys.reduce((map, key) => map.set(key.keyCode, key), new Map());
export const keysByInputChar = keys.reduce((map, key) => map.set(key.inputChar, key), new Map());
export function isModifier(keyCode) {
  return keyCode.match(/^((Shift|Control|Alt|Meta)(Left|Right)|CapsLock)$/) ? true : false;
}
// TODO: Allow to control this sequence as part of the extension options.
export const keyOrder = ORDERED_INPUT_CHARS.split('').reduce(
  (agg, val) => {
    agg.push(keysByInputChar.get(val));
    return agg;
  }, []);

export const indexByKeyCode = keyOrder.reduce((acc, val, idx) => acc.set(val, idx), new Map());

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

export function parseDigitKeycode(keyCode) {
  const match = keyCode.match(/^Digit(\d)$/);
  if (!match) {
    return { exists: false };
  }
  return { exists: true, value: Number(match[1]) };
}

