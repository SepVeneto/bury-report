import { serverRequest as request } from '@/util/request'

export type AccountRole = 'admin' | 'member'
export type AccountStatus = 'active' | 'disabled'

export interface Account {
  id: string
  name: string
  role: AccountRole
  status: AccountStatus
  create_time: string | null
  update_time: string | null
  last_login_time: string | null
}

export interface AccountListParams {
  page: number
  size: number
  name?: string
  role?: AccountRole | ''
  status?: AccountStatus | ''
}

export interface AccountInput {
  name: string
  password?: string
  role: AccountRole
  status: AccountStatus
}

export function getAccountProfile() {
  return request<Account>({
    url: '/account/profile',
  })
}

export function updatePassword(data: {
  password_old: string
  password: string
}) {
  return request({
    url: '/account/password',
    method: 'PATCH',
    data,
  }, true)
}

export function getAccountList(params: AccountListParams) {
  return request<{ list: Account[]; total: number }>({
    url: '/accounts',
    params,
    raw: 'data',
  })
}

export function createAccount(data: AccountInput) {
  return request<string>({
    url: '/accounts',
    method: 'POST',
    data,
  }, true)
}

export function updateAccount(id: string, data: AccountInput) {
  return request({
    url: '/accounts',
    method: 'PATCH',
    data: { id, ...data },
  }, true)
}

export function deleteAccount(id: string) {
  return request({
    url: '/accounts',
    method: 'DELETE',
    params: { id },
  }, true)
}
