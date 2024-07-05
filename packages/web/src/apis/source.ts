import { Restful, reportRequest as request } from '@/util/request'

export type SourceRecord = {
  pid?: string,
  id: string
  name: string
  value: string
  children: SourceRecord[],
}

export type SourceInfo = Omit<SourceRecord, 'children'>

class Source extends Restful {
  options() {
    return request<SourceInfo[]>({
      url: this.normalizeUrl(this.resource, 'options'),
      method: 'get',
      raw: 'data',
    })
  }

  children(pid?: string) {
    return request<SourceInfo[]>({
      url: this.normalizeUrl(this.resource, pid, 'children'),
      method: 'get',
    })
  }
}
const source = new Source('/source')

export function getList() {
  return source.list<unknown, SourceRecord[]>({})
}

export function update(data: SourceInfo) {
  if (data.id) {
    return source.edit(data.id, data)
  } else {
    return source.create(data)
  }
}

export function del(id: string) {
  return source.delete(id)
}

export function options(): Promise<SourceInfo[]>
export function options(pid: SourceRecord['pid']): Promise<SourceInfo[]>
export function options(pid?: SourceRecord['pid']) {
  if (pid) {
    return source.children(pid)
  } else {
    return source.options()
  }
}
