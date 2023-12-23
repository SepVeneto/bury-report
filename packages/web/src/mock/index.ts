export * from './menus'
export * from './mods'
import { menus } from './menus'
import { mods } from './mods'
import { parseQuery } from 'vue-router'

import Mock from 'mockjs'

Mock.mock(/^\/api\/menu\??.*/, (options) => {
  const query = parseQuery(options.url.split('?')[1])
  return {
  code: 0,
  data: { list: menus[query.modId as unknown as keyof typeof menus] },
  msg: null,
}
})

Mock.mock(/^\/api\/mod\??.*/, () => {
  return {
  code: 0,
  data: mods,
  msg: null,
}
})
