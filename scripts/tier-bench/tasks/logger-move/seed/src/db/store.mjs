import { log } from '../log.mjs';

export class Store {
  #data = new Map();

  set(key, value) {
    if (this.#data.has(key)) {
      log('warn', `overwriting ${key}`, this.#data.get(key));
    }
    this.#data.set(key, value);
    log('info', `set ${key}`);
  }

  get(key) {
    if (!this.#data.has(key)) {
      log('warn', `missing ${key}`);
      return undefined;
    }
    return this.#data.get(key);
  }

  remove(key) {
    const existed = this.#data.delete(key);
    log('info', `removed ${key}`, existed);
    return existed;
  }
}
