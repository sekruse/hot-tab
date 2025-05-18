export async function lpc(command, args) {
  const response = await chrome.runtime.sendMessage({ command, args });
  if (!response.success) {
    throw response.error;
  }
  return response.result;
}

export class UserException {
  constructor(message) {
    this.name = 'UserException';
    this.message = message;
  }
}
