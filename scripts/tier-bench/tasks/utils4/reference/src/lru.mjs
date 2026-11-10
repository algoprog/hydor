export class LRUCache {
  #capacity;
  #ttlMs;
  #now;
  #entries = new Map(); // oldest first

  constructor({ capacity, ttlMs = Infinity, now = Date.now } = {}) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError('capacity must be a positive integer');
    this.#capacity = capacity;
    this.#ttlMs = ttlMs;
    this.#now = now;
  }

  #expired(entry) {
    return this.#now() >= entry.expires;
  }

  #purge() {
    for (const [key, entry] of this.#entries) if (this.#expired(entry)) this.#entries.delete(key);
  }

  get(key) {
    const entry = this.#entries.get(key);
    if (!entry) return undefined;
    if (this.#expired(entry)) {
      this.#entries.delete(key);
      return undefined;
    }
    this.#entries.delete(key);
    this.#entries.set(key, entry);
    return entry.value;
  }

  set(key, value) {
    this.#purge();
    this.#entries.delete(key);
    if (this.#entries.size >= this.#capacity) this.#entries.delete(this.#entries.keys().next().value);
    this.#entries.set(key, { value, expires: this.#now() + this.#ttlMs });
    return this;
  }

  has(key) {
    const entry = this.#entries.get(key);
    return entry !== undefined && !this.#expired(entry);
  }

  delete(key) {
    const entry = this.#entries.get(key);
    if (!entry) return false;
    this.#entries.delete(key);
    return !this.#expired(entry);
  }

  get size() {
    this.#purge();
    return this.#entries.size;
  }

  keys() {
    this.#purge();
    return [...this.#entries.keys()];
  }
}
