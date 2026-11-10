import { logger } from '../logger.mjs';

export class Store {
  #data = new Map();

  set(key, value) {
    if (this.#data.has(key)) {
      logger.warn(`overwriting ${key}`, this.#data.get(key));
    }
    this.#data.set(key, value);
    logger.info(`set ${key}`);
  }

  get(key) {
    if (!this.#data.has(key)) {
      logger.warn(`missing ${key}`);
      return undefined;
    }
    return this.#data.get(key);
  }

  remove(key) {
    const existed = this.#data.delete(key);
    logger.info(`removed ${key}`, existed);
    return existed;
  }
}
