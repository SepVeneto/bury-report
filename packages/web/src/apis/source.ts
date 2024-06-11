import { Restful, request } from '@/util/request'

class Source extends Restful {
  options() {
    return request({
      url: this.normalizeUrl(this.resource, 'options'),
      method: 'get',
      raw: 'data',
    })
  }
}
const source = new Source('/source')

export function getList(params: { page: number, size: number }) {
  return source.list(params)
}

export type SourceRecord = {
  pid?: string,
  id?: string
  name: string
  value: string
}
export function update(data: SourceRecord) {
  if (data.id) {
    return source.edit(data.id, data)
  } else {
    return source.create(data)
  }
}

export function del(id: string) {
  return source.delete(id)
}

export function options() {
  return source.options()
}
