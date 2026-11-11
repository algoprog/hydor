// An error whose message is for the person at the keyboard: the command prints it and exits with code 2.
export class TtError extends Error {}

export function fail(message) {
  throw new TtError(message);
}
