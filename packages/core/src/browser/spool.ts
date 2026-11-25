import { estimateSize } from '@/utils'

export const MAX_TRACK_SPOOL_BYTES = 16 * 1024 * 1024
export const MAX_TRACK_SPOOL_BATCHES = 20

export type TrackSpoolMeta = {
  appid: string
  url: string
  sessionid?: string
  deviceid?: string
}

export type TrackSpoolBatch = {
  meta: TrackSpoolMeta
  data: any[]
}

type SpoolRecord = {
  key: string
  size: number
  createdAt: number
  batch: TrackSpoolBatch
}

type AppendResult = {
  accepted: boolean
  dropped: string[]
}

const STORE_NAME = 'track-batches'
const DB_VERSION = 1

const databasePromises = new Map<string, Promise<IDBDatabase | undefined>>()

export function createSpoolNamespace(appid: string, url: string) {
  return `bury-report-spool-${String(appid || 'unknown')}-${hashString(String(url || ''))}`
}

export function planSpoolEvictions(
  records: SpoolRecord[],
  incomingSize: number,
  maxBytes = MAX_TRACK_SPOOL_BYTES,
  maxBatches = MAX_TRACK_SPOOL_BATCHES,
) {
  const sorted = records.slice().sort((a, b) => a.createdAt - b.createdAt)
  let bytes = sorted.reduce((sum, item) => sum + item.size, 0) + incomingSize
  let count = sorted.length + 1
  const evicted: SpoolRecord[] = []

  while (sorted.length && (bytes > maxBytes || count > maxBatches)) {
    const record = sorted.shift()!
    evicted.push(record)
    bytes -= record.size
    count--
  }

  return {
    accepted: incomingSize <= maxBytes && count <= maxBatches,
    evicted,
  }
}

export async function appendTrackSpool(
  namespace: string,
  key: string,
  batch: TrackSpoolBatch,
): Promise<AppendResult> {
  const size = estimateSize(batch)
  const db = await getDatabase(namespace)
  if (!db) {
    return {
      accepted: size <= MAX_TRACK_SPOOL_BYTES,
      dropped: [],
    }
  }

  try {
    const records = await readAll(db)
    const { accepted, evicted } = planSpoolEvictions(records, size)
    if (!accepted) return { accepted: false, dropped: [key] }

    await transaction(db, store => {
      evicted.forEach(record => store.delete(record.key))
      store.put({
        key,
        size,
        createdAt: Date.now(),
        batch,
      } satisfies SpoolRecord)
    })

    return {
      accepted: true,
      dropped: evicted.map(record => record.key),
    }
  } catch {
    return {
      accepted: size <= MAX_TRACK_SPOOL_BYTES,
      dropped: [],
    }
  }
}

export async function removeTrackSpool(namespace: string, key: string) {
  const db = await getDatabase(namespace)
  if (!db) return
  try {
    await transaction(db, store => store.delete(key))
  } catch {}
}

export async function loadTrackSpool(namespace: string) {
  const db = await getDatabase(namespace)
  if (!db) return [] as SpoolRecord[]
  try {
    return (await readAll(db)).sort((a, b) => a.createdAt - b.createdAt)
  } catch {
    return [] as SpoolRecord[]
  }
}

function getDatabase(namespace: string) {
  const cached = databasePromises.get(namespace)
  if (cached) return cached
  if (typeof indexedDB === 'undefined') {
    const promise = Promise.resolve(undefined)
    databasePromises.set(namespace, promise)
    return promise
  }

  const promise = new Promise<IDBDatabase | undefined>(resolve => {
    try {
      const request = indexedDB.open(namespace, DB_VERSION)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' })
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(undefined)
      request.onblocked = () => resolve(undefined)
    } catch {
      resolve(undefined)
    }
  })
  databasePromises.set(namespace, promise)
  return promise
}

function readAll(db: IDBDatabase) {
  return new Promise<SpoolRecord[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const request = tx.objectStore(STORE_NAME).getAll()
    request.onsuccess = () => resolve(request.result as SpoolRecord[])
    request.onerror = () => reject(request.error)
  })
}

function transaction(
  db: IDBDatabase,
  operation: (store: IDBObjectStore) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    operation(tx.objectStore(STORE_NAME))
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

function hashString(value: string) {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}
