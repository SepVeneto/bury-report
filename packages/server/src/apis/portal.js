const Router = require('@koa/router')
const router = new Router()
const db = require('../db')
const { ObjectId } = require('mongodb')
const { normalize } = require('../utils')

router.get('/portal', async (ctx, next) => {
  const apps = db.collection('apps')
  const projects = db.collection('projects')

  const match = { is_delete: { $ne: true }}
  const appList = await apps.find(match, { projection: { _id: 0, id: '$_id', name: 1, icon: 1 } }).toArray()
  const projectList = await projects.find(match, { projection: { _id: 0, id: '$_id', name: 1, apps: 1 } }).toArray()
  const res = new Map()

  for (const app of appList) {
    const project = isAppInProject(app, projectList)
    if (project) {
      continue
    }
    res.set(app.id, { ...app, type: 'app' })
  }
  projectList.push(...res.values())
  projectList.sort((a, b) => {
    return a.id.getTimestamp().getTime() - b.id.getTimestamp().getTime()
  })
  ctx.body = projectList.map(item => {
    if (item.apps) {
      return { ...item, type: 'project' }
    }
    return item
  })
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

module.exports = router