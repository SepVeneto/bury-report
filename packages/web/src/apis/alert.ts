import { reportRequest as request } from '@/util/request'

export function getAlertRuleList(params: { page: number, size: number }) {
  return request({
    url: '/alert/rule/list',
    params,
    raw: 'data',
  })
}

type AlertRule = {
  id?: string
  name: string
}
export function updateAlertRule(data: AlertRule) {
  return request({
    url: `/alert/rule${data.id ? `/${data.id}` : ''}`,
    method: data.id ? 'put' : 'post',
    data,
  }, true)
}
