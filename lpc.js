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

  toString() {
    return `UserException: ${message}`;
  }
}

export class Client {
  constructor(methods) {
    for (let m of methods) {
      this[m] = async (args) => {
        return lpc(m, args);
      }
    }
  }
}

export class Server {
  constructor(messageHandlers) {
    this.messageHandlers = messageHandlers;
  }

  serve(msg, sender, respond) {
    console.log(`Incoming message: ${JSON.stringify(msg)}`);
    const handler = this.messageHandlers[msg.command];
    if (!handler) {
      throw new UserException(`No handler for message: ${JSON.stringify(msg)}`);
    }
    handler(msg.args).then((result) => {
      const response = { success: true, result };
      console.log(`Response: ${JSON.stringify(response)}`);
      respond(response);
    }).catch((error) => {
      console.log(error);
      const response = {
          success: false,
          error: {
            name: error.name,
            message: error.message,
          }
        };
      console.log(`Response: ${JSON.stringify(response)}`);
      respond(response);
    });
    return true;
  }
}
