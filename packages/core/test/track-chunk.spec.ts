import { selfState } from './helpers/self-stub'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import pako from 'pako'
import { OPERATION_TRACK } from '../src/constant'
import { packTrackPayloads } from '../src/browser/worker'

function makeTrack(events: number, blobSize = 0, stamp = 1) {
  return {
    type: OPERATION_TRACK,
    data: {
      events: Array.from({ length: events }, (_, i) => ({
        type: 3,
        timestamp: i,
        data: { blob: 'x'.repeat(blobSize) },
      })),
    },
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
  for (let i = 0; i < 8; i++) await Promise.resolve()
}

/** 解出二进制协议里的事件记录（0x00 + "session:appid|" + gzip(json)） */
function decodeTracks(body: Uint8Array): any[] {
  const rest = body.subarray(1)
  const pipe = rest.indexOf(0x7c)
  const json = pako.ungzip(rest.subarray(pipe + 1), { to: 'string' })
  return JSON.parse(json)
}

function eventsOf(records: any[]) {
  return records.reduce((sum, item) => sum + (item?.data?.events?.length || 0), 0)
}

beforeEach(async () => {
  vi.useFakeTimers()
  // 每个用例重新加载 worker 模块，避免重试缓冲 / 定时器状态串扰
  vi.resetModules()
  await import('../src/browser/worker')
  selfState.fetch = vi.fn().mockResolvedValue({ ok: true })
  selfState.postMessage = vi.fn()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('packTrackPayloads', () => {
  it('空数组不产生分片', () => {
    expect(packTrackPayloads([])).toEqual([])
  })

  it('未超预算时保持单条消息', () => {
    const records = [makeTrack(2), makeTrack(2)]
    const chunks = packTrackPayloads(records, 1024 * 1024)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toHaveLength(2)
  })

  it('超预算时切分且记录不丢', () => {
    const records = Array.from({ length: 20 }, (_, i) => makeTrack(1, 200, i))
    const chunks = packTrackPayloads(records, 100)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.flat()).toHaveLength(20)
  })

  it('单条记录自身超预算时仍单独成组（交给服务端兜底拆分）', () => {
    const chunks = packTrackPayloads([makeTrack(1, 4096)], 10)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toHaveLength(1)
  })
})

describe('worker track 分片投递', () => {
  it('小批量仍只发一次请求（行为不变）', async () => {
    dispatch([makeTrack(3, 16)])
    await flush()

    expect(selfState.fetch).toHaveBeenCalledTimes(1)
    expect(eventsOf(decodeTracks(selfState.fetch.mock.calls[0][1].body))).toBe(3)
  })

  it('超过单条上限的合并 track 会被拆成多条消息，且事件不丢', async () => {
    // 每条记录约 2.8MB JSON（5 个事件 × 560KB），三条合计超过「1MB gzip × 8」的估算预算
    const blob = 560 * 1024
    dispatch([makeTrack(5, blob, 1), makeTrack(5, blob, 2), makeTrack(5, blob, 3)])
    await flush()

    const calls = selfState.fetch.mock.calls
    expect(calls.length).toBe(2)
    const total = calls.reduce((sum, call) => sum + eventsOf(decodeTracks(call[1].body)), 0)
    expect(total).toBe(15)
    // 每片仍是合法的 gzip 协议帧
    for (const call of calls) {
      expect(call[1].body).toBeInstanceOf(Uint8Array)
      expect(call[1].body[0]).toBe(0)
    }
  })

  it('只有失败的那一片进入重试缓冲', async () => {
    const blob = 560 * 1024
    const records = [makeTrack(5, blob, 1), makeTrack(5, blob, 2), makeTrack(5, blob, 3)]
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true })
      .mockRejectedValueOnce(new Error('down'))
    selfState.fetch = fetchMock

    dispatch(records)
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(1)

    // 下一轮只重发失败的那一片，成功的那片不再重复投递
    fetchMock.mockResolvedValue({ ok: true })
    vi.advanceTimersByTime(10 * 1000)
    await flush()

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(eventsOf(decodeTracks(fetchMock.mock.calls[2][1].body))).toBe(5)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keepalive 场景同样按片投递', async () => {
    const blob = 560 * 1024
    dispatch([makeTrack(5, blob, 1), makeTrack(5, blob, 2), makeTrack(5, blob, 3)], true)
    await flush()

    const calls = selfState.fetch.mock.calls
    expect(calls.length).toBe(2)
    expect(calls.every((call: any[]) => call[1].keepalive === true)).toBe(true)
    expect(calls.reduce((sum: number, call: any[]) => sum + eventsOf(decodeTracks(call[1].body)), 0)).toBe(15)
  })
})
