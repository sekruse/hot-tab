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
