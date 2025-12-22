import { reportRequest as request } from '@/util/request'

export function getAlertRuleList(params: { page: number, size: number }) {
  return request({
    url: '/alert/rule/list',
    params,
    raw: 'data',
  })
}

export type AlertRule = {
  id?: string,
  name: string,
  enabled: boolean,
  strategy: 'once' | 'window' | 'limit',
  source: {
    type: 'collection' | 'fingerprint',
    log_type?: 'error' | 'api' | 'log',
    fingerprint?: string
  },
  notify: {
    url: string,
    window_sec?: number,
    limit?: number
  },
}
export function updateAlertRule(data: AlertRule) {
  return request({
    url: `/alert/rule${data.id ? `/${data.id}` : ''}`,
    method: data.id ? 'put' : 'post',
    data,
  }, true)
}

export function deleteAlertRule(id: string) {
  return request({
    url: `/alert/rule/${id}`,
    method: 'delete',
  }, true)
}

export function toggleAlertRule(id: string, enabled: boolean) {
  return request({
    url: `/alert/rule/${id}/toggle`,
    method: 'patch',
    data: {
      enabled,
    }
  }, true)
}
