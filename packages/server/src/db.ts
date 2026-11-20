import { CollectionInfo, Db, MongoClient } from 'mongodb'
import process from "node:process"
import type { AccountDocument } from './utils/account.ts'
import { hashPassword } from './utils/password.ts'

// const client = new MongoClient('mongodb://db:27017')
export const client = new MongoClient(`mongodb://${process.env.DB_NAME || 'root'}:${process.env.DB_PWD || 'root_123'}@${process.env.REPORT_DB_URL}`)


const db = client.db('reporter')
await init()

async function init() {
  await initClient()
  await initDb()
}

export async function initApp(db: Db) {
  {
    const futures = [
      'records_api',
      'records_log',
      'records_track',
      // 旧版本的小程序页面轨迹（回放数据），仍要按 session 查
      'records_mp_track',
      'records_session'
    ].map(name => {
      const col = db.collection(name)
      return col.createIndexes([{ key: { uuid: 1, }}, { key: { session: 1 }}])
    })
    await Promise.all(futures)
    // FCP/日志按类型和时间范围查询
    await db.collection('records_log').createIndex({ type: 1, create_time: -1 })
    await db.collection('records_log').createIndex({ uuid: 1, type: 1, create_time: -1 })
  }

  {
    const col = db.collection('records_custom_id')
    await col.createIndexes([{ key: { id: 1, }}])
  }

  {
    const col = db.collection('records_err')
    await col.createIndexes([{ key: { uuid: 1, }}, { key: { session: 1 }}, { key: { fingerprint: 1 }}])
  }

  {
    const futures = [
      'alert_rule',
      'history_error',
    ].map(name => {
      const col = db.collection(name)
      return col.createIndexes([{ key: { fingerprint: 1, }}])
    })
    await Promise.all(futures)
  }

  {
    const col = db.collection('alert_fact')
    const indexes = await col.indexes().catch(() => [])
    if (!indexes.some(index => index.name === 'fingerprint_1')) {
      await col.createIndex({ fingerprint: 1 })
    }

    const lastSeenIndex = indexes.find(index => index.name === 'last_seen_1')
    if (!lastSeenIndex) {
      // 超过7天仍不活跃的事实可以被删除
      // 因此告警阈值的时间窗口最大不能超过24小时
      await col.createIndex(
        { last_seen: 1 },
        { expireAfterSeconds: 60 * 60 * 24 * 7 },
      )
    } else if (lastSeenIndex.expireAfterSeconds !== 60 * 60 * 24 * 7) {
      console.warn('[alert] 已存在配置不同的 last_seen 索引，跳过 TTL 索引创建')
    }
  }
}
async function initClient() {
  const apps = await client.db().admin().listDatabases()
  const appList: string[] = []
  apps.databases.forEach(db => {
    if (db.name.startsWith('app_')) {
      const app = client.db(db.name)
      appList.push(db.name)
      initApp(app)
    }
  })
  return appList
}

async function initDb() {
  await client.connect()
  const collections = await db.listCollections().toArray()
  await Promise.all([
    createCollection('apps', collections),
    createCollection('projects', collections),
    createCollection('users', collections),
  ])

  const users = db.collection<AccountDocument>('users')
  await Promise.all([
    users.updateMany({ role: { $exists: false } }, { $set: { role: 'admin' } }),
    users.updateMany({ status: { $exists: false } }, { $set: { status: 'active' } }),
    users.updateMany({ is_delete: { $exists: false } }, { $set: { is_delete: false } }),
    users.updateMany(
      { must_reset_password: { $exists: false } },
      { $set: { must_reset_password: false } },
    ),
    users.updateMany(
      { must_bind_two_factor: { $exists: false } },
      { $set: { must_bind_two_factor: false } },
    ),
  ])
  const projectIds = (await db.collection('projects').find({
    is_delete: { $ne: true },
  }, {
    projection: { _id: 1 },
  }).toArray()).map(project => project._id.toHexString())
  await Promise.all([
    users.updateMany(
      { role: 'member', project_ids: { $exists: false } },
      { $set: { project_ids: projectIds } },
    ),
    users.updateMany(
      { role: 'admin', project_ids: { $exists: false } },
      { $set: { project_ids: [] } },
    ),
  ])
  await users.createIndex(
    { name: 1 },
    {
      name: 'unique_active_user_name',
      unique: true,
      partialFilterExpression: { is_delete: false },
    },
  ).catch((err) => {
    console.error('[account] 用户名唯一索引创建失败:', err)
  })

  if (await users.countDocuments({ is_delete: { $ne: true } }) === 0) {
    const name = process.env.ADMIN_NAME || 'admin'
    const password = process.env.ADMIN_PASSWORD || 'Admin123456'
    const now = new Date()
    await users.insertOne({
      name,
      password_hash: hashPassword(password),
      role: 'admin',
      status: 'active',
      is_delete: false,
      create_time: now,
      update_time: now,
    })
    console.warn(`[account] 已创建初始管理员 ${name}，请登录后立即修改密码`)
  }
  // createCollection('logs', collections)
}

async function createCollection(name: string, collections: (CollectionInfo| Pick<CollectionInfo, "name" | "type">)[]) {
  const exist = collections.find(collection => collection.name === name)
  if (!exist) {
    await db.createCollection(name)
  }
}
