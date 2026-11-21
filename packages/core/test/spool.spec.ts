import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_TRACK_SPOOL_BATCHES,
  MAX_TRACK_SPOOL_BYTES,
  appendTrackSpool,
  createSpoolNamespace,
  planSpoolEvictions,
} from '../src/browser/spool'

function record(key: string, size: number, createdAt: number) {
  return { key, size, createdAt, data: [] }
}

describe('录屏有界 spool', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('离线积压超过8MB或20批时优先淘汰最旧批次', () => {
    const records = Array.from({ length: MAX_TRACK_SPOOL_BATCHES }, (_, i) =>
      record(`old-${i}`, 512 * 1024, i))
    const result = planSpoolEvictions(records, 1024 * 1024)

    expect(result.accepted).toBe(true)
    expect(result.evicted.length).toBeGreaterThan(0)
    const remainingBytes = records
      .filter(item => !result.evicted.includes(item))
      .reduce((sum, item) => sum + item.size, 1024 * 1024)
    expect(remainingBytes).toBeLessThanOrEqual(MAX_TRACK_SPOOL_BYTES)
  })

  it('单批超过spool总预算时直接拒绝，不挤掉全部已有数据', () => {
    const result = planSpoolEvictions(
      [record('old', 1024, 1)],
      MAX_TRACK_SPOOL_BYTES + 1,
    )
    expect(result.accepted).toBe(false)
  })

  it('IndexedDB 不可用时降级为有界内存队列且不抛错', async () => {
    const result = await appendTrackSpool('bury-report-spool-a-test', 'batch', {
      meta: { appid: 'a', url: 'http://host.example/record' },
      data: [{ type: 'track' }],
    })
    expect(result.accepted).toBe(true)
    expect(result.dropped).toEqual([])
  })

  it('不同 appid 或上报地址使用不同的 spool 命名空间', () => {
    expect(createSpoolNamespace('a', 'https://a.example/report'))
      .not.toBe(createSpoolNamespace('b', 'https://a.example/report'))
    expect(createSpoolNamespace('a', 'https://a.example/report'))
      .not.toBe(createSpoolNamespace('a', 'https://b.example/report'))
  })

  it('IndexedDB 持久化完整批次元数据并按命名空间隔离', async () => {
    vi.resetModules()
    vi.stubGlobal('indexedDB', createFakeIndexedDB())
    const spool = await import('../src/browser/spool')
    const namespaceA = spool.createSpoolNamespace('a', 'https://a.example/report')
    const namespaceB = spool.createSpoolNamespace('b', 'https://b.example/report')
    const batch = {
      meta: {
        appid: 'a',
        url: 'https://a.example/report',
        sessionid: 'session-a',
        deviceid: 'device-a',
      },
      data: [{ type: 'track', stamp: 1 }],
    }

    await spool.appendTrackSpool(namespaceA, 'batch-a', batch)
    const restoredA = await spool.loadTrackSpool(namespaceA)
    const restoredB = await spool.loadTrackSpool(namespaceB)

    expect(restoredA).toHaveLength(1)
    expect(restoredA[0].batch).toEqual(batch)
    expect(restoredB).toEqual([])

    await spool.removeTrackSpool(namespaceA, 'batch-a')
    expect(await spool.loadTrackSpool(namespaceA)).toEqual([])
  })
})

function createFakeIndexedDB() {
  const databases = new Map<string, Map<string, any>>()

  return {
    open(name: string) {
      const request: any = {}
      const stores = databases.get(name) || new Map<string, Map<string, any>>()
      if (!databases.has(name)) databases.set(name, stores)
      const db: any = {
        objectStoreNames: {
          contains: (storeName: string) => stores.has(storeName),
        },
        createObjectStore: (storeName: string) => {
          stores.set(storeName, new Map())
        },
        transaction: (storeName: string) => createTransaction(stores.get(storeName) || new Map()),
      }
      queueMicrotask(() => {
        request.result = db
        if (!stores.has('track-batches')) request.onupgradeneeded?.()
        request.onsuccess?.()
      })
      return request
    },
  }
}

function createTransaction(records: Map<string, any>) {
  const tx: any = {}
  tx.objectStore = () => ({
    getAll() {
      const request: any = {}
      queueMicrotask(() => {
        request.result = [...records.values()]
        request.onsuccess?.()
      })
      return request
    },
    put(record: any) {
      records.set(record.key, record)
      queueMicrotask(() => tx.oncomplete?.())
    },
    delete(key: string) {
      records.delete(key)
      queueMicrotask(() => tx.oncomplete?.())
    },
  })
  return tx
}
