import { Restful } from '@/util/request'

const source = new Restful('/source')

export function getList(params: { page: number, size: number }) {
  return source.list(params)
}

export type SourceRecord = {
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
