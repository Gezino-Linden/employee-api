// File: src/utils/cache.js
// Lightweight in-memory cache with TTL expiry — no Redis needed.
// Uses Node's built-in Map. Safe for single-process deployments (Render free tier).

class Cache {
  constructor() {
    this.store = new Map();
  }

  // Set a value with a TTL in seconds (default 5 minutes)
  set(key, value, ttlSeconds = 300) {
    const expiresAt = Date.now() + ttlSeconds * 1000;
    this.store.set(key, { value, expiresAt });
  }

  // Get a value — returns null if missing or expired
  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  // Invalidate a single key
  del(key) {
    this.store.delete(key);
  }

  // Invalidate all keys that start with a prefix
  // e.g. cache.invalidatePrefix('accounts:') clears all company account caches
  invalidatePrefix(prefix) {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }

  // Clear everything (useful for testing)
  flush() {
    this.store.clear();
  }

  // How many entries are currently cached
  size() {
    return this.store.size;
  }
}

// Export a single shared instance — same object used across all controllers
module.exports = new Cache();
