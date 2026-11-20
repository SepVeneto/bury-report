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
  two_factor_enabled: boolean
  project_ids: string[]
  must_reset_password: boolean
  must_bind_two_factor: boolean
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
  project_ids?: string[]
}

export interface TwoFactorSetup {
  secret: string
  otpauth_url: string
  expires_at: string
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

export function setupTwoFactor() {
  return request<TwoFactorSetup>({
    url: '/account/2fa/setup',
    method: 'POST',
  })
}

export function enableTwoFactor(code: string) {
  return request<{ two_factor_enabled: boolean }>({
    url: '/account/2fa/enable',
    method: 'POST',
    data: { code },
  }, true)
}

export function disableTwoFactor(code: string) {
  return request<{ two_factor_enabled: boolean }>({
    url: '/account/2fa/disable',
    method: 'POST',
    data: { code },
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

export function resetAccountTwoFactor(id: string) {
  return request({
    url: '/accounts/2fa/reset',
    method: 'POST',
    data: { id },
  }, true)
}
