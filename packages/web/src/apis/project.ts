import { serverRequest as request } from '@/util/request'

export type Project = {
  id: string
  name: string
  apps: { id: string, name: string }[]
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
