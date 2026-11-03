import { buildFcpAnalysis } from './record.ts'

function assertEquals(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

Deno.test('FCP analysis aggregates percentiles and request impact', () => {
  const now = new Date('2026-11-03T10:00:00.000Z')
  const result = buildFcpAnalysis([
    {
      _id: '1',
      create_time: now,
      data: {
        fcp: 1_250_000,
        resources: [
          { url: 'https://cdn/a.js?v=1', type: 'script', startTime: 100, responseEnd: 1000, responseTime: 700, duration: 900 },
          { url: 'https://cdn/b.css?v=1', type: 'link', startTime: 200, responseEnd: 500, responseTime: 200, duration: 300 },
          { url: 'https://api/slow', type: 'fetch', startTime: 300, responseEnd: 2000, responseTime: 1500, duration: 1700 },
        ],
      },
    },
    {
      _id: '2',
      create_time: now,
      data: {
        fcp: 4_200_000,
        resources: [
          { url: 'https://cdn/a.js?v=2', type: 'script', startTime: 1200, responseEnd: 3600, responseTime: 1800, duration: 2400 },
        ],
      },
    },
    {
      _id: '3',
      create_time: now,
      data: {
        fcp: 800_000,
        resources: [],
      },
    },
  ], {
    slowThreshold: 2000,
    totalInWindow: 3,
    start: now,
    end: now,
  })

  assertEquals(result.summary.total, 3)
  assertEquals(result.summary.p50, 1250)
  assertEquals(result.summary.p90, 4200)
  assertEquals(result.summary.slowCount, 1)
  assertEquals(result.summary.slowRate, 33.3)
  assertEquals(result.distribution.find(item => item.label === '3 - 5s')?.count, 1)
  assertEquals(result.resources[0], {
    url: 'https://cdn/a.js',
    type: 'script',
    count: 2,
    averageResponseTime: 1250,
    averageDuration: 1650,
    maxDuration: 2400,
    averageFcp: 2725,
    slowCount: 1,
    slowRate: 50,
  })
  assertEquals(result.recentSlow[0]?.topResources[0]?.duration, 2400)
  assertEquals(result.recentSamples[0]?.requests[0]?.startTime, 1200)
  assertEquals(result.recentSamples[0]?.requests[0]?.responseEnd, 3600)
})

Deno.test('FCP analysis tolerates empty and malformed samples', () => {
  const now = new Date()
  const result = buildFcpAnalysis([
    { _id: 'empty', create_time: now, data: {} },
    { _id: 'bad', create_time: now, data: { fcp: 'bad', resources: 'bad' } },
  ], {
    slowThreshold: 2500,
    totalInWindow: 2,
    start: now,
    end: now,
  })

  assertEquals(result.summary.total, 0)
  assertEquals(result.trend, [])
  assertEquals(result.resources, [])
  assertEquals(result.recentSlow, [])
})

