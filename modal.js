const modalPane = document.getElementById("modal");
const modalCancelButton = document.getElementById("modal-cancel-button");
const modalSaveButton = document.getElementById("modal-save-button");
const modalDeleteButton = document.getElementById("modal-delete-button");

function show() {
  modalPane.classList.remove('hidden', 'animate-vanish', 'animate-appear');
  modalPane.classList.add('animate-appear');
}

function hide() {
  modalPane.classList.remove('animate-appear');
  modalPane.classList.add('animate-vanish');
}

function isVisible() {
  return !modalPane.classList.contains('hidden') && !modalPane.classList.contains('animate-vanish');
}

function init(onSave, onDelete) {
  modalCancelButton.addEventListener('click', hide);
  modalSaveButton.classList.toggle('hidden', !onSave);
  if (onSave) {
    modalSaveButton.addEventListener('click', onSave);
  }
  modalDeleteButton.classList.toggle('hidden', !onDelete);
  if (onDelete) {
    modalDeleteButton.addEventListener('click', onDelete);
  }
}

export default {
  init,
  show,
  hide,
  isVisible,
};
