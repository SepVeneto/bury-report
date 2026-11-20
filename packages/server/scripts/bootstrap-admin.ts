import { MongoClient } from 'mongodb'
import process from 'node:process'
import type { AccountDocument } from '../src/utils/account.ts'
import { hashPassword } from '../src/utils/password.ts'

const name = process.env.ADMIN_NAME || 'admin'
const password = process.env.ADMIN_PASSWORD || 'Admin123456'
const client = new MongoClient(
  `mongodb://${process.env.DB_NAME || 'root'}:${process.env.DB_PWD || 'root_123'}@${process.env.REPORT_DB_URL}`,
)

await client.connect()
try {
  const users = client.db('reporter').collection<AccountDocument>('users')
  const now = new Date()
  const result = await users.updateOne(
    { name },
    {
      $set: {
        password_hash: hashPassword(password),
        role: 'admin',
        status: 'active',
        is_delete: false,
        update_time: now,
      },
      $setOnInsert: {
        name,
        create_time: now,
      },
      $unset: { password: '' },
    },
    { upsert: true },
  )
  console.log(
    result.upsertedCount
      ? `[account] 已创建管理员 ${name}`
      : `[account] 已重置管理员 ${name} 的密码`,
  )
} finally {
  await client.close()
}
