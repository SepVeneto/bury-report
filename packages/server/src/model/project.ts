import { Db, Document, Filter as MongoFilter, ObjectId, WithId } from "mongodb"
import { Filter, Model } from "./index.ts"
import type { BaseType } from "./index.ts";
import type { IApp } from "./app.ts";

interface IProject extends BaseType {
  name: string
  apps: IApp[]
}

export class Project extends Model<IProject> {
  constructor(db: Db) {
    super(db, 'projects')
  }

  async canAccessApp(projectIds: string[], appId: string) {
    const ids = projectIds
      .filter(id => ObjectId.isValid(id))
      .map(id => new ObjectId(id))
    if (!ids.length || !appId) return false

    const project = await this.col.findOne({
      _id: { $in: ids },
      'apps.id': { $in: getAppIdCandidates(appId) },
      is_delete: { $ne: true },
    }, {
      projection: { _id: 1 },
    })
    return Boolean(project)
  }

  async insertApp(pid: string, app: IApp & { id: string }) {
    const _id = ObjectId.createFromHexString(pid)
    await this.col.updateOne({ _id } as MongoFilter<IProject>, {
      $addToSet: { apps: app }
    })
  }
  getVisible(projectIds: string[]) {
    const ids = projectIds
      .filter(id => ObjectId.isValid(id))
      .map(id => new ObjectId(id))
    return this.getAll(new Filter<IProject>({ _id: { $in: ids } }))
  }
  async updateApp(pid: string, data: WithId<IApp>) {
    const _id = ObjectId.createFromHexString(pid)
    const { _id: aid, ...app } = data
    const _appId = aid
    await this.col.updateOne({ _id, 'apps.id': _appId }, {
      $set: app
    })
  }
  async deleteApp(pid: string, aid: string) {
    const _id = ObjectId.createFromHexString(pid)
    const _aid = ObjectId.createFromHexString(aid)

    await this.col.updateOne({ _id }, {
      $pull: { 'apps.id': _aid } as Document
    })
  }
}

export function getAppIdCandidates(appId: string) {
  if (!/^[0-9a-f]{24}$/i.test(appId)) return [appId]

  return [appId, new ObjectId(appId)]
}
