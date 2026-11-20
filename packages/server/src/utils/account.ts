import dayjs from 'dayjs'
import type { WithId } from 'mongodb'

export type AccountRole = 'admin' | 'member'
export type AccountStatus = 'active' | 'disabled'

export interface AccountDocument {
  name: string
  password?: string
  password_hash?: string
  role?: AccountRole
  status?: AccountStatus
  is_delete?: boolean
  create_time?: Date
  update_time?: Date
  last_login_time?: Date
}

export interface PublicAccount {
  id: string
  name: string
  role: AccountRole
  status: AccountStatus
  create_time: string | null
  update_time: string | null
  last_login_time: string | null
}

export function normalizeAccountName(name: unknown) {
  return typeof name === 'string' ? name.trim() : ''
}

export function normalizeAccountRole(role: unknown): AccountRole {
  return role === 'admin' ? 'admin' : 'member'
}

export function normalizeAccountStatus(status: unknown): AccountStatus {
  return status === 'disabled' ? 'disabled' : 'active'
}

export function toPublicAccount(account: WithId<AccountDocument>): PublicAccount {
  return {
    id: account._id.toHexString(),
    name: account.name,
    role: normalizeAccountRole(account.role),
    status: normalizeAccountStatus(account.status),
    create_time: formatTime(account.create_time),
    update_time: formatTime(account.update_time),
    last_login_time: formatTime(account.last_login_time),
  }
}

function formatTime(time?: Date) {
  return time ? dayjs(time).format('YYYY-MM-DD HH:mm:ss') : null
}
