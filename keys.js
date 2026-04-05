export const GLOBAL_LAYER_ID = 0;
export const LAYER_IDS = Array.from(Array(10).keys());
export const HISTORY_KEY = 'Backspace';

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


export function parseDigitKeycode(keyCode) {
  const match = keyCode.match(/^Digit(\d)$/);
  if (!match) {
    return { exists: false };
  }
  return { exists: true, value: Number(match[1]) };
}

