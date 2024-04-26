import { Restful } from '@/util/request'

const source = new Restful('/source')

export function getList(params: { page: number, size: number }) {
  return source.list(params)
}

export function update(data: { id: string }) {
  if (data.id) {
    return source.edit(data.id, data)
  } else {
    return source.create(data)
  }
}
