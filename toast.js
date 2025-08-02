function initToast() {
  const toastClose = document.getElementById('toast-close');
  toastClose.addEventListener('click', () => hideToast());
}

function showToast(message, timeoutMillis, style) {
  const toast = document.getElementById('toast');
  const toastContent = document.getElementById('toast-content');
  toast.classList.remove('toast-red');
  if (style) {
    toast.classList.add(style);
  }
  toastContent.innerText = message;
  toast.classList.remove('hidden', 'animate-vanish', 'animate-appear');
  toast.classList.add('animate-appear');
  if (timeoutMillis) {
    setTimeout(() => { hideToast(message) }, timeoutMillis);
  }
}

function hideToast(expectedMessage) {
  const toast = document.getElementById('toast');
  const toastContent = document.getElementById('toast-content');
  if (!expectedMessage || toastContent.innerText === expectedMessage) {
    toast.classList.remove('animate-appear');
    toast.classList.add('animate-vanish');
  }
}

function catchAndDisplay(func) {
  return async (a, b, c, d, e) => {
    try {
      return await func(a, b, c, d, e);
    } catch (err) {
      if (err.name === 'UserException') {
        showToast(`Error: ${err.message}`, 3000, 'toast-error');
      } else {
        showToast('Oops, something went wrong... :/', 5000 /*ms*/, 'toast-error');
        throw err;
      }
    }
  };
}

export default {
  init: initToast,
  show: showToast,
  hide: hideToast,
  catch: catchAndDisplay,
};

