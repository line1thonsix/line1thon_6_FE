// Development-only stand-in for server persistence. No real API uses this storage.
// Results/answers are deliberately not persisted; they are served behind the Mock lock.
export type MockPersistence = { read(key: string): unknown; write(key: string, value: unknown): void }
export function persistentMap<K, V>(name: string, storage?: MockPersistence): Map<K, V> {
  class PersistedMap extends Map<K, V> {
    override set(key: K, value: V): this {
      super.set(key, value)
      storage?.write(name, [...this])
      return this
    }
  }
  const map = new PersistedMap()
  const raw = storage?.read(name)
  if (Array.isArray(raw) && raw.every(row => Array.isArray(row) && row.length === 2)) {
    for (const [key, value] of raw) Map.prototype.set.call(map, key, value)
  }
  return map
}
