export class TranspositionCache {
  constructor(maxEntries = 768) {
    this.maxEntries = Math.max(1, Math.floor(maxEntries));
    this.entries = new Map();
  }

  get size() {
    return this.entries.size;
  }

  clear() {
    this.entries.clear();
  }

  get(key) {
    if (!this.entries.has(key)) {
      return null;
    }

    const value = this.entries.get(key);
    // Promote as most recently used.
    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }

  set(key, value) {
    if (this.entries.has(key)) {
      this.entries.delete(key);
    }
    this.entries.set(key, value);

    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      this.entries.delete(oldestKey);
    }
  }
}
