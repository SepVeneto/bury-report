import type { App, Project } from '@/apis'
import type { MenuItem } from '@imengyu/vue3-context-menu'
import type { InjectionKey } from 'vue'

export type AppData = {
  type: 'app',
  pid: Project['id'],
  data: App,
}
export type ProjectData = {
  type: 'project',
  data: Project,
}

export const PortalKey: InjectionKey<{
  handleContextmenu: (evt: MouseEvent, items: MenuItem[]) => void,
  getList: () => void,
  projects: Project[],
}> = Symbol('Portal')
