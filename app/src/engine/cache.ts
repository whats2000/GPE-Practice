import { openDB, type IDBPDatabase, type DBSchema } from 'idb'

interface CompileCacheSchema extends DBSchema {
  compiled: {
    key: string
    value: {
      key: string
      wasm: Uint8Array
      lastAccessed: number
    }
    indexes: { 'by-lastAccessed': number }
  }
}

const DB_NAME = 'gpe-engine-cache'
const DB_VERSION = 1
const STORE = 'compiled' as const
const MAX_ENTRIES = 100

let dbPromise: Promise<IDBPDatabase<CompileCacheSchema>> | null = null

function getDb(): Promise<IDBPDatabase<CompileCacheSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<CompileCacheSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore(STORE, { keyPath: 'key' })
        store.createIndex('by-lastAccessed', 'lastAccessed')
      },
    })
  }
  return dbPromise
}

export async function hashSource(source: string, opt: string): Promise<string> {
  const data = new TextEncoder().encode(`${opt}\n${source}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function getCached(key: string): Promise<Uint8Array | null> {
  const db = await getDb()
  const row = await db.get(STORE, key)
  if (!row) return null
  row.lastAccessed = Date.now()
  await db.put(STORE, row)
  // Re-wrap in a local-realm Uint8Array so cross-realm structured-clone
  // round-trips (e.g. fake-indexeddb in tests) compare correctly.
  return new Uint8Array(row.wasm.buffer, row.wasm.byteOffset, row.wasm.byteLength)
}

export async function putCached(key: string, wasm: Uint8Array): Promise<void> {
  const db = await getDb()
  await db.put(STORE, { key, wasm, lastAccessed: Date.now() })
  await evictIfOver(db, MAX_ENTRIES)
}

async function evictIfOver(
  db: IDBPDatabase<CompileCacheSchema>,
  cap: number,
): Promise<void> {
  const count = await db.count(STORE)
  if (count <= cap) return
  const toRemove = count - cap
  const tx = db.transaction(STORE, 'readwrite')
  const index = tx.store.index('by-lastAccessed')
  let cursor = await index.openCursor()
  let removed = 0
  while (cursor && removed < toRemove) {
    await cursor.delete()
    removed++
    cursor = await cursor.continue()
  }
  await tx.done
}

/** Test helper — wipe the store. */
export async function _clearForTests(): Promise<void> {
  const db = await getDb()
  await db.clear(STORE)
}
