import { request } from '@/util/request'

type RulePie = {
  type: 'Pie',
  name: string,
  source: string,
  dimension: string,
  sort: string,
}
type RuleLine = {
  type: 'Line',
  name: string,
  source: string,
  dimension: string,
  sort: string,
}
type RuleBar = {
  type: 'Bar',
  name: string,
  source: string,
  dimension: string,
  sort: string,
}

export type ChartRule = RulePie | RuleLine | RuleBar

export type Record = {
  id: string
  appid: string
  type: string
  data: ChartRule,
}

export function preview(params: ChartRule) {
  return request<any[]>({
    url: '/statistics/preview',
    method: 'get',
    params,
  })
}

export function create(data: ChartRule) {
  return request({
    url: '/statistics/create',
    method: 'post',
    data,
  }, true)
}
export function update(id: string, data: ChartRule) {
  return request({
    url: `/statistics/update/${id}`,
    method: 'put',
    data,
  }, true)
}

export function list() {
  return request<Record[]>({
    url: '/statistics/list',
    method: 'get',
  })
}

export function chart(chartId: string) {
  return request<any[]>({
    url: `/statistics/chart/${chartId}`,
  })
}

export function del(id: string) {
  return request({
    url: `/statistics/${id}`,
    method: 'DELETE',
  }, true)
}
