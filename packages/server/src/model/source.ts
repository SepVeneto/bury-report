import { Db, ObjectId } from "mongodb";
import { BaseType, Model } from "./index.ts";

interface ISource extends BaseType {
  id: ObjectId
  name: string,
  value: string,
  pid?: string,
}

export class Source extends Model<ISource> {
  constructor(db: Db) {
    super(db, 'source')
  }

  async list() {
    const list = await this.getAll({}, { name: 1, value: 1, pid: 1 })
    return array2tree(list)
  }
}

function array2tree(arr: ISource[]) {
  const map = new Map<string, ISource & { children?: ISource[] }>()
  const root: (ISource & { children?: ISource[] })[] = []

  arr.forEach(item => {
    if (item.pid) return

    map.set(item.id.toString(), item)
    root.push(item)
  })

  arr.forEach(item => {
    if (item.pid) {
      const p = map.get(item.pid)
      if (!p) {
        return
      }
      const children = p.children || []
      children.push(item)
      p.children = children
    }
  })

  return Array.from(map.values())
}