import { isUniWeixin } from '../utils'

export function initNetwork() {
  if (isUniWeixin()) {
    return 'import "@sepveneto/report-core/helper/wx"\n'
  } else {
    return 'import "@sepveneto/report-core/helper/XMLHttpRequest"\n'
  }
}
