import { Cron } from "croner";
import { TaskManager } from "./TaskManager.ts";

const NETDATA_URL = Deno.env.get('NETDATA_URL')
const NETDATA_PUSH = Deno.env.get('NETDATA_PUSH')

export async function debug() {
  const res = await request('/api/v1/data', {
    params: {
      chart: 'cgroup_report-log.cpu_limit',
      _: Date.now(),
      format: 'array',
      points: 540,
      group: 'average',
      gtime: 0,
      options: 'absolute|jsonwrap|nonzero',
      after: -540,
      dimensions: 'used'
    }
  })
  console.log(res)
}

// if (!NETDATA_URL) {
//   console.warn('NETDATA_URL is not set, will skip netdata collect')
// } else {
//   const task = new Cron('', async () => {
//     const res = await request('/api/v1/data', {
//       params: {
//         chart: 'cgroup_report-log.cpu_limit',
//         _: Date.now(),
//         format: 'array',
//         points: 540,
//         group: 'average',
//         gtime: 0,
//         options: 'absolute|jsonwrap|nonzero',
//         after: -540,
//         dimensions: 'used'
//       }
//     })
//     console.log(res)
//   })
//   TaskManager.add('netdata-collect', task)
// }

// if (!NETDATA_PUSH) {
//   console.warn('NETDATA_PUSH is not set, will skip netdata push')
// } else {
//   const task = new Cron('')
//   TaskManager.add('netdata-push', task)
// }

async function request(url: string, options: { method?: string, body?: Record<string, any>, params?: Record<string, any> }) {
  const BASE_URL = NETDATA_URL
  const qs = genQs(options.params)
  const _url = qs ? `${BASE_URL}${url}?${qs}` : `${BASE_URL}${url}`
  const res = await fetch(_url, {
    method: options.method || 'get',
  })
  return (await res.json()).data
}

function genQs(params?: Record<string, any>) {
  if (!params) return ''

  return Object.entries(params).reduce<string[]>((acc, [key, value]) => {
    acc.push(`${key}=${value}`)
    return acc
  }, []).join('&')
}
