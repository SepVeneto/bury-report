import { selfState } from './helpers/self-stub'
import '../src/browser/worker'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OPERATION_TRACK } from '../src/constant'

function makeRecord(type: string, stamp = 0, size = 16) {
  return {
    type,
    data: { blob: 'x'.repeat(size) },
    session: 's',
    uuid: 'u',
    time: String(stamp),
    stamp,
  }
}

function dispatch(store: any[], keepalive = false) {
  ;(globalThis as any).self.onmessage({
    data: { type: 'report', store, appid: 'a', sessionid: 's', deviceid: 'u', keepalive },
  })
}

async function flush() {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

beforeEach(() => {
  vi.useFakeTimers()
  selfState.fetch = vi.fn().mockResolvedValue({ ok: true })
  selfState.postMessage = vi.fn()
  selfState.close = vi.fn()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('worker 上报可靠性', () => {
  it('普通上报成功：一次请求，body 为可解析 JSON，无重试定时器', async () => {
    const records = [makeRecord('custom', 1), makeRecord('custom', 2)]
    dispatch(records)
    await flush()

    expect(selfState.fetch).toHaveBeenCalledTimes(1)
    const body = selfState.fetch.mock.calls[0][1].body
    expect(typeof body).toBe('string')
    const parsed = JSON.parse(body)
    expect(parsed.appid).toBe('a')
    expect(parsed.data).toHaveLength(2)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('fetch 失败后数据留在 worker 内，10s 后自动重试，成功即停止', async () => {
    selfState.fetch
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValue({ ok: true })

    dispatch([makeRecord('custom', 1)])
    await flush()
    expect(selfState.fetch).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(1)

    vi.advanceTimersByTime(10 * 1000)
    await flush()
    expect(selfState.fetch).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keepalive 按大小分片发送，不做重试', async () => {
    const records = Array.from({ length: 100 }, (_, i) => makeRecord('custom', i, 1024))
    dispatch(records, true)
    await flush()

    expect(selfState.fetch.mock.calls.length).toBeGreaterThan(1)
    expect(vi.getTimerCount()).toBe(0)
    // 每片都符合 keepalive 体积上限
    for (const call of selfState.fetch.mock.calls) {
      const body = JSON.stringify(JSON.parse(call[1].body))
      expect(body.length).toBeLessThanOrEqual(48 * 1024 + 2048)
    }
  })

  it('tracks 走 gzip 协议（协议字节 + session:appid 头部）', async () => {
    const track = {
      type: OPERATION_TRACK,
      data: { events: [{ type: 4 }] },
      session: 's',
      uuid: 'u',
      time: '1',
      stamp: 1,
    }
    dispatch([track])
    await flush()

    expect(selfState.fetch).toHaveBeenCalledTimes(1)
    const body: Uint8Array = selfState.fetch.mock.calls[0][1].body
    expect(body[0]).toBe(0)
    const header = new TextDecoder().decode(body.subarray(1, 20))
    expect(header).toContain('s:a|')
  })

  it('keepalive 失败不重试（页面关闭，尽力而为）', async () => {
    selfState.fetch.mockRejectedValue(new Error('down'))
    dispatch([makeRecord('custom', 1)], true)
    await flush()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keepalive 时录屏事件流原子送达：多段记录合并为单个 gzip 请求，不拆分', async () => {
    const tracks = Array.from({ length: 3 }, (_, i) => ({
      type: OPERATION_TRACK,
      data: {
        events: Array.from({ length: 100 }, (_, j) => ({
          type: 3,
          timestamp: i * 100 + j,
          data: { source: 0, texts: [], attributes: [], removes: [], adds: [] },
        })),
      },
      session: 's',
      uuid: 'u',
      time: String(i),
      stamp: i,
    }))
    dispatch(tracks, true)
    await flush()

    // 事件流只有一个 gzip 请求（原子送达），不会被拆成多片
    expect(selfState.fetch).toHaveBeenCalledTimes(1)
    const body: Uint8Array = selfState.fetch.mock.calls[0][1].body
    expect(body[0]).toBe(0)
    // 三段事件都在同一请求内
    const gzipText = new TextDecoder().decode(body.subarray(1))
    const header = gzipText.slice(0, gzipText.indexOf('|'))
    expect(header).toBe('s:a')
  })
})
