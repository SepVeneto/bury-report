import Router from '@koa/router'

import db from '../db.js'
import { ObjectId } from 'mongodb'
import { normalize } from '../utils/index.js'
import { Project } from '../model/project.js'
import { App } from '../model/app.js'

const router = new Router()

router.get('/portal', async (ctx, next) => {
  const project = new Project(db)

  const list = await project.getAll()
  ctx.body = list
  // const match = { is_delete: { $ne: true }}
  // const appList = await apps.find(match, { projection: { _id: 0, id: '$_id', name: 1, icon: 1 } }).toArray()
  // const projectList = await projects.find(match, { projection: { _id: 0, id: '$_id', name: 1, apps: 1 } }).toArray()
  // const res = new Map()

  // for (const app of appList) {
  //   const project = isAppInProject(app, projectList)
  //   if (project) {
  //     continue
  //   }
  //   res.set(app.id, { ...app, type: 'app' })
  // }
  // projectList.push(...res.values())
  // projectList.sort((a, b) => {
  //   return a.id.getTimestamp().getTime() - b.id.getTimestamp().getTime()
  // })
  // ctx.body = projectList.map(item => {
  //   if (item.apps) {
  //     return { ...item, type: 'project' }
  //   }
  //   return item
  // })
  await next()
})

function isAppInProject(app, projectList) {
  let exist
  projectList.some(project => {
    const res = project.apps.some(_app => {
      return _app.id.toString() === app.id.toString()
    })
    if (res) {
      exist = { ...project, type: 'project' }
      return true
    }
  })
  return exist
}

export default router
