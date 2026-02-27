import { DuckDBConnection, DuckDBInstance } from '@duckdb/node-api'
import { client } from '../db.ts'
import PQueue from 'p-queue'
import { ObjectId } from "mongodb";
import fs from 'node:fs'
import dayjs from 'dayjs'

const queue = new PQueue({ concurrency: 3 })

if (!fs.existsSync('data')) {
  fs.mkdirSync('data')
}

const connMap = new Map<string, DuckDBConnection>()
const dbMap = new Map<string, DuckDBInstance>()
export async function init(apps: string[]) {
  for (const app of apps) {
    const instance = await DuckDBInstance.create(`data/${app}.db`)
    dbMap.set(app, instance)
    const conn = await instance.connect()
    connMap.set(app, conn)

    await conn.run(`
      CREATE TABLE IF NOT EXISTS network_recent(
        _id VARCHAR,
        source_app VARCHAR,
        uuid VARCHAR,
        session VARCHAR,
        device_time VARCHAR,
        content VARCHAR,
        create_time TIMESTAMP,
        PRIMARY KEY (_id, source_app)
      );
    `)

    await conn.run(`
      CREATE TABLE IF NOT EXISTS _sync_state (
        coll VARCHAR PRIMARY KEY,
        last_id VARCHAR
      )
    `)
  }
}

export async function run() {
  const tasks: { db: string, col: string }[] = []
  const apps = await client.db().admin().listDatabases()
  apps.databases.forEach(db => {
    if (db.name.startsWith('app_')) {
      tasks.push({ db: db.name, col: 'records_api' })
    }
  })
  while (true) {
    tasks.forEach(task => {
      queue.add(() => syncCol(task.db, task.col))
    })
    await new Promise(resolve => setTimeout(resolve, 60 * 1000))
  }
}

async function getConn(dbName: string) {
  let conn: DuckDBConnection
  if (connMap.has(dbName)) {
    conn = connMap.get(dbName)!
  } else {
    let instance = dbMap.get(dbName)
    if (!instance) {
      console.warn(`${dbName}数据库未打开`)
      instance = await DuckDBInstance.create(`data/${dbName}.db`)
      dbMap.set(dbName, instance)
    }
    conn = await instance.connect()
    console.warn(`${dbName}数据库未连接`)
    connMap.set(dbName, conn)
  }
  return conn
}

async function syncCol(dbName: string, colName: string) {
  const conn = await getConn(dbName)
  const col = client.db(dbName).collection(colName)

  const lastId = await getLastId(conn, colName)
  const query = lastId ? { _id: { $gt: new ObjectId(lastId as string)}} : {}

  const list = await col.find(query).sort({ _id: 1 }).limit(5000).toArray()
  console.log('sync', list.length, 'sync id', lastId, 'query', query, colName)
  if (!list.length) return false

  await conn.run('BEGIN')

  const insert = await conn.prepare(`
    INSERT INTO network_recent VALUES(
      $_id,
      $source_app,
      $uuid,
      $session,
      $device_time,
      $content,
      $create_time
    )
  `)
  for (const item of list) {
    insert.bind({
      _id: item._id.toString(),
      source_app: `app_${item.appid}`,
      uuid: item.uuid,
      session: item.session,
      device_time: item.device_time,
      content: JSON.stringify(item.data),
      create_time: new Date().toISOString(),
    })
    await insert.run()
  }

  const newLastId = list[list.length - 1]._id.toString()
  await conn.run(`
    INSERT INTO _sync_state VALUES('${colName}', '${newLastId}')
    ON CONFLICT(coll) DO UPDATE SET last_id=excluded.last_id;
  `) 

  await conn.run('COMMIT')

  console.log(`${dbName}-${colName}同步到duckdb，总计${list.length}条数据，id更新到${newLastId}`)

  return true
}

async function getLastId(conn: DuckDBConnection, colName: string) {
  const r = await conn.runAndReadAll(
    `SELECT last_id FROM _sync_state WHERE coll='${colName}';`
  )
  return r.getRowObjectsJS()?.[0]?.last_id
}

export async function safeClose() {
  for (const conn of connMap.values()) {
    await conn.run('CHECKPOINT')
    conn.closeSync()
  }
}

export async function archiveData(dbName: string) {
  const conn = await getConn(dbName)
  const end = dayjs().add(1, 'day').startOf('day')
  const start = dayjs().startOf('day')
  const date = start.format('YYYY_MM_DD')
  fs.mkdirSync(`data/archive/${date}`, { recursive: true })
  const list = await conn.run(`
    SELECT *
    FROM network_recent
    WHERE create_time < TIMESTAMP '${end.format('YYYY-MM-DD HH:mm:ss')}'
  `)
  console.log((await list.getRowObjects()))
  await conn.run(`
    COPY (
      SELECT *
      FROM network_recent
      WHERE create_time < TIMESTAMP '${end.format('YYYY-MM-DD HH:mm:ss')}'
    )
    TO 'data/archive/${date}/${dbName}.network_recent.parquet'
  `)
  await conn.run('BEGIN')
  await conn.run(`
    CREATE TABLE network_recent_new (
      _id VARCHAR,
      source_app VARCHAR,
      uuid VARCHAR,
      session VARCHAR,
      device_time VARCHAR,
      content VARCHAR,
      create_time TIMESTAMP,
      PRIMARY KEY (_id, source_app)
    );
  `)
  // 只需要保留当天的数据
  await conn.run(`
    INSERT INTO network_recent_new
    SELECT * FROM network_recent
    WHERE create_time >= TIMESTAMP '${end.format('YYYY-MM-DD HH:mm:ss')}';
  `)
  await conn.run(`DROP TABLE network_recent`)
  await conn.run(`ALTER TABLE network_recent_new RENAME TO network_recent`)

  await conn.run('COMMIT')

  // conn.closeSync()
  // connMap.delete(dbName)
  console.log(`数据库${dbName}归档完成`)
}
