// Tiny in-memory TTL cache used to shield the database from heavy traffic.
// Public read endpoints store their serialized response here; subsequent
// requests are served without touching SQLite until the entry expires.
const store = new Map();

export function cached(key, ttlMs, producer) {
  const hit = store.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const value = producer();
  store.set(key, { value, expires: Date.now() + ttlMs });
  return value;
}

export function invalidate(prefix) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

export function clearCache() {
  store.clear();
}
