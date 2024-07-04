import { Restful, reportRequest as request } from '@/util/request'

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

export type SourceRecord = {
  pid?: string,
  id?: string
  name: string
  value: string
  children: SourceRecord[],
}

export function getList() {
  return source.list<unknown, SourceRecord[]>({})
}

export function update(data: Omit<SourceRecord, 'children'>) {
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
