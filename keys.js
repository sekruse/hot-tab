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
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach((ch) => cs.set(`Key${ch}`, ch));
  '1234567890'.split('').forEach((d) => cs.set(`Digit${d}`, d));
  return cs;
})();
