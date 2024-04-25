import { Restful, request } from '@/util/request'

const source = new Restful('/source')

export function getList(params: { page: number, size: number }) {
  return source.list(params)
}

export function update(data) {
  return request({
    url: data.id ? `/source/${data.id}` : '/source',
  })
}
