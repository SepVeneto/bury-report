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
  assertEquals(result.resources.find(item => item.url === 'https://cdn/a.js'), {
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
  assertEquals(result.recentSamples[0]?.requests[0]?.phase, 'before-fcp')
  assertEquals(
    result.recentSamples.find(item => item.id === '1')?.requests.some(item => item.url === 'https://api/slow'),
    true,
  )
})

Deno.test('web-vitals samples keep all metrics and resources on both sides of FCP', () => {
  const now = new Date('2026-11-05T10:00:00.000Z')
  const result = buildFcpAnalysis([{
    _id: 'web-vitals',
    create_time: now,
    data: {
      perfVersion: 2,
      fcp: 2000,
      lcp: 3500,
      inp: 120,
      ttfb: 180,
      ratings: { fcp: 'good', lcp: 'needs-improvement' },
      metricIds: { fcp: 'fcp-id', lcp: 'lcp-id' },
      navigationType: 'navigate',
      resourceCount: 2,
      resources: [
        { url: 'https://cdn/before.js', type: 'script', phase: 'before-fcp', startTime: 100, responseEnd: 500, responseTime: 300, duration: 400 },
        { url: 'https://cdn/after.js', type: 'script', phase: 'after-fcp', startTime: 2500, responseEnd: 3000, responseTime: 300, duration: 500 },
      ],
    },
  }], {
    slowThreshold: 2500,
    totalInWindow: 1,
    start: now,
    end: now,
  })

  const sample = result.recentSamples[0]
  assertEquals(sample?.fcp, 2000)
  assertEquals(sample?.lcp, 3500)
  assertEquals(sample?.inp, 120)
  assertEquals(sample?.ttfb, 180)
  assertEquals(sample?.navigationType, 'navigate')
  assertEquals(sample?.resourceCount, 2)
  assertEquals(sample?.requests.map(item => item.phase), ['before-fcp', 'after-fcp'])
})

Deno.test('FCP analysis keeps protected response time unknown instead of averaging it as zero', () => {
  const now = new Date('2026-11-05T10:00:00.000Z')
  const result = buildFcpAnalysis([{
    _id: 'protected',
    create_time: now,
    data: {
      fcpMs: 3000,
      resources: [
        { url: 'https://cdn/same.js?v=1', type: 'script', startTime: 100, responseEnd: 0, responseTime: null, duration: 2700 },
        { url: 'https://cdn/same.js?v=2', type: 'script', startTime: 100, responseEnd: 400, responseTime: 200, duration: 300 },
      ],
    },
  }], {
    slowThreshold: 2500,
    totalInWindow: 1,
    start: now,
    end: now,
  })

  assertEquals(result.resources[0]?.averageResponseTime, 200)
  assertEquals(result.recentSamples[0]?.requests[0]?.responseTime, null)
  assertEquals(result.recentSamples[0]?.requests[0]?.responseEnd, 2800)
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

