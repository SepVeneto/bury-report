import { Db, Document, Filter, ObjectId, WithId } from "mongodb"
import { Model } from "./index.ts"
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

  async insertApp(pid: string, app: IApp & { id: string }) {
    const _id = ObjectId.createFromHexString(pid)
    await this.col.updateOne({ _id } as Filter<IProject>, {
      $addToSet: { apps: app }
    })
  }
  async updateApp(pid: string, data: WithId<IApp>) {
    const _id = ObjectId.createFromHexString(pid)
    const { _id: aid, ...app } = data
    const _appId = aid
    await this.col.updateOne({ _id, 'apps._id': _appId }, {
      $set: app
    })
  }
  async deleteApp(pid: string, aid: string) {
    const _id = ObjectId.createFromHexString(pid)
    const _aid = ObjectId.createFromHexString(aid)

    await this.col.updateOne({ _id }, {
      $pull: { 'apps._id': _aid } as Document
    })
  }
}