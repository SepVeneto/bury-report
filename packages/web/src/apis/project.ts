import { serverRequest as request } from '@/util/request'
import type { App } from '.'

export type Project = {
  id: string
  name: string
  apps: App[]
}
export function getProjectList() {
  return request<Project[]>({
    url: '/project/list',
  })
}
export function updateProject(data: { name: string, id?: string }) {
  return request({
    url: '/project',
    method: data.id ? 'patch' : 'post',
    data,
  }, true)
}
export function deleteProject(projectId: string) {
  return request({
    url: '/project',
    method: 'delete',
    params: { id: projectId },
  }, true)
}

export function getProject(projectId: string) {
  return request<Project>({
    url: '/project',
    params: { id: projectId },
  })
}

export function moveAppTo(appId: App['id'], projectId: Project['id']) {
  return request({
    url: `/app/${appId}/move_to`,
    method: 'patch',
    data: {
      projectId,
    },
  }, true)
}

export function updateApp(pid: string, data: { name: string, id?: string }) {
  return request({
    url: '/app',
    method: data.id ? 'patch' : 'post',
    data: {
      pid,
      ...data,
    },
  }, true)
}
export function deleteApp(appId: string) {
  return request({
    url: '/app',
    method: 'delete',
    params: { id: appId },
  }, true)
}
export function getApp(appId: string) {
  return request<App>({
    url: '/app',
    params: { id: appId },
  })
}
