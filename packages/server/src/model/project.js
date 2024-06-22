import { ObjectId } from "mongodb"
import { Model } from "./index.js"

export class Project extends Model {
  constructor() {
    super('projects')
  }
  async findAppById(pid, id) {
    const project = await this.findById(pid, { apps: 1 })
    const { _id, ...app }= project.apps.find(app => app._id === id)
    return {
      id: _id,
      ...app,
    }
  }
  async insertApp(pid, app) {
    const _id = ObjectId.createFromHexString(pid)
    await this.col.updateOne({ _id }, {
      $addToSet: { apps: app }
    })
  }
  async updateApp(pid, data) {
    const _id = ObjectId.createFromHexString(pid)
    const { _id: aid, ...app } = data
    const _appId = ObjectId.createFromHexString(aid)
    await this.col.updateOne({ _id, 'apps._id': _appId }, {
      $set: app
    })
  }
  async deleteApp(pid, aid) {
    const _id = ObjectId.createFromHexString(pid)
    const _aid = ObjectId.createFromHexString(aid)

    await this.col.updateOne({ _id }, {
      $pull: { 'apps._id': _aid }
    })
  }
}