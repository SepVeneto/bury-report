import { selfState } from './helpers/self-stub'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { COLLECT_API, OPERATION_TRACK } from '../src/constant'

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

function makeTrack(stamp = 0) {
  return {
    type: OPERATION_TRACK,
    data: { events: [{ type: 4, timestamp: stamp }] },
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

function jsonBodies() {
  return selfState.fetch.mock.calls
    .map((call: any[]) => call[1].body)
    .filter((body: any) => typeof body === 'string')
}

function gzipBodies() {
  return selfState.fetch.mock.calls
    .map((call: any[]) => call[1].body)
    .filter((body: any) => body instanceof Uint8Array)
}

beforeEach(async () => {
  vi.useFakeTimers()
  // 每个用例重新加载 worker 模块，避免重试缓冲 / 定时器状态在用例间串扰
  vi.resetModules()
  await import('../src/browser/worker')
  selfState.fetch = vi.fn().mockResolvedValue({ ok: true })
  selfState.postMessage = vi.fn()
  selfState.close = vi.fn()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('worker 消息与数据组装', () => {
  it('未知消息类型只告警，不影响后续上报', async () => {
    ;(globalThis as any).self.onmessage({ data: { type: 'unknown' } })

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('invalid event type'),
    )
    expect(selfState.fetch).not.toHaveBeenCalled()

    // worker 仍然可用
    dispatch([makeRecord('custom', 1)])
    await flush()
    expect(selfState.fetch).toHaveBeenCalledTimes(1)
  })

  it('空数据不发送请求', async () => {
    dispatch([])
    await flush()

    expect(selfState.fetch).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('乱序数据按 stamp 排序后发送', async () => {
    dispatch([makeRecord('custom', 3), makeRecord('custom', 1), makeRecord('custom', 2)])
    await flush()

    const data = JSON.parse(jsonBodies()[0]).data
    expect(data.map((item: any) => item.stamp)).toEqual([1, 2, 3])
  })

  it('普通与接口数据合并为单个请求', async () => {
    dispatch([makeRecord('custom', 1), makeRecord(COLLECT_API, 2), makeRecord('custom', 3)])
    await flush()

    expect(selfState.fetch).toHaveBeenCalledTimes(1)
    const data = JSON.parse(jsonBodies()[0]).data
    expect(data.map((item: any) => item.type).sort()).toEqual(['custom', 'custom', COLLECT_API].sort())
  })
})

describe('worker 重试缓冲', () => {
  it('重试缓冲最多保留 100 条', async () => {
    selfState.fetch.mockRejectedValue(new Error('down'))
    const records = Array.from({ length: 150 }, (_, i) => makeRecord('custom', i, 8))
    dispatch(records)
    await flush()

    expect(selfState.fetch).toHaveBeenCalledTimes(1)
    expect(JSON.parse(jsonBodies()[0]).data).toHaveLength(150)
    expect(vi.getTimerCount()).toBe(1)

    // 重试时只发送缓冲上限内的数据
    selfState.fetch.mockClear()
    vi.advanceTimersByTime(10 * 1000)
    await flush()

    expect(selfState.fetch).toHaveBeenCalledTimes(1)
    expect(JSON.parse(jsonBodies()[0]).data).toHaveLength(100)
  })

  it('录屏 gzip 发送失败后进入重试', async () => {
    selfState.fetch.mockRejectedValue(new Error('down'))
    dispatch([makeTrack(1)])
    await flush()

    expect(selfState.fetch).toHaveBeenCalledTimes(1)
    expect(gzipBodies()).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(1)

    selfState.fetch.mockReset()
    selfState.fetch.mockResolvedValue({ ok: true })
    vi.advanceTimersByTime(10 * 1000)
    await flush()

    expect(selfState.fetch).toHaveBeenCalledTimes(1)
    expect(gzipBodies()).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('重试已排队时不会叠加多个定时器', async () => {
    selfState.fetch.mockRejectedValue(new Error('down'))
    dispatch([makeRecord('custom', 1)])
    await flush()
    expect(vi.getTimerCount()).toBe(1)

    // 重试计时期间再收到数据，失败后仍只保留一个定时器
    dispatch([makeRecord('custom', 2)])
    await flush()
    expect(vi.getTimerCount()).toBe(1)
  })
})

describe('worker keepalive 分片', () => {
  it('普通与接口数据按体积分片，录屏事件流单独 gzip 原子送达', async () => {
    const others = [makeRecord('custom', 1, 1024), makeRecord('custom', 2, 1024)]
    const api = [makeRecord(COLLECT_API, 3, 1024)]
    dispatch([...others, ...api, makeTrack(4)], true)
    await flush()

    const jsonCalls = jsonBodies()
    expect(jsonCalls.length).toBeGreaterThanOrEqual(1)
    expect(gzipBodies()).toHaveLength(1)

    for (const body of jsonCalls) {
      expect(JSON.stringify(JSON.parse(body)).length).toBeLessThanOrEqual(48 * 1024 + 2048)
    }
    const types = jsonCalls.flatMap((body: string) => JSON.parse(body).data.map((item: any) => item.type))
    expect(types).toContain(COLLECT_API)
    expect(types).toContain('custom')

    // 页面关闭场景不重试
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keepalive 且没有录屏数据时只发普通分片', async () => {
    dispatch([makeRecord('custom', 1)], true)
    await flush()

    expect(jsonBodies()).toHaveLength(1)
    expect(gzipBodies()).toHaveLength(0)
  })
})
