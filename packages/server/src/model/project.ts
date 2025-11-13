import { Document, ObjectId } from "mongodb"
import { Model } from "./index.ts"

export class Project extends Model {
  constructor() {
    super('projects')
  }
  async findAppById(pid: string, id: string) {
    const project = await this.findById(pid, { apps: 1 })
    if (!project) throw new Error('没有找到指定的项目')
    const { _id, ...app }= project.apps.find((app: any) => app._id === id)
    return {
      id: _id,
      ...app,
    }
  }
  async insertApp(pid: string, app: any) {
    const _id = ObjectId.createFromHexString(pid)
    await this.col.updateOne({ _id }, {
      $addToSet: { apps: app }
    })
  }
  async updateApp(pid: string, data: any) {
    const _id = ObjectId.createFromHexString(pid)
    const { _id: aid, ...app } = data
    const _appId = ObjectId.createFromHexString(aid)
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