import { reportRequest as request } from '@/util/request'
import { Query } from '.'

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
  source: {
    type: 'collection' | 'fingerprint' | 'group',
    log_type?: 'error' | 'api' | 'log',
    fingerprint?: string
    text?: string
    condition?: { type: 'literal' | 'number' | 'uuid', value?: string }[]
  },
  notify: {
    strategy: 'once' | 'window' | 'limit',
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
    },
  }, true)
}

export function getHistoryErrorList(params: { page: number, size: number }) {
  const _params = new Query(params).build()
  return request({
    url: '/alert/history/list',
    params: _params,
    raw: 'data',
  })
}
