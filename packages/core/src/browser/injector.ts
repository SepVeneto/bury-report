import type { Options } from '@/type'
import { ErrorPlugin } from './plugins/error'

function init(options: Options) {
  try {
    const plugin = new ErrorPlugin()
    plugin.init(options.appid)

    // 核心 SDK 与 rrweb 插件完全解耦：任一方加载失败/缓慢都不影响宿主、
    // 不影响对方，也不阻塞首屏（均为异步加载）
    loadScript(options.url).then(() => {
      plugin.resetListener()

      if ('BuryReport' in window) {
        try {
          // eslint-disable-next-line no-new
          new window.BuryReport(options)
        } catch (error) {
          console.warn('[@sepveneto/report-core] init failed with error', error)
        }
      } else {
        console.warn('[@sepveneto/report-core] cannot find BuryReport in window, maybe the core script is not loaded correctly')
      }
    }).catch((error) => {
      // 服务器关闭 / 404：SDK 不可用，但宿主不受影响，恢复 console.error
      plugin.resetListener()
      console.warn('[@sepveneto/report-core] core sdk load failed: ' + error)
    })

    if (options.operationRecord?.enable) {
      loadScript(options.url, 'plugins/operationRecord.global.js').then(() => {
        // 异步加载的 rrweb 插件：若核心 SDK 已初始化，registerPlugin 会立即初始化该插件
        if ('BuryReport' in window && 'OperationRecordPlugin' in window) {
          window.BuryReport.registerPlugin(new window.OperationRecordPlugin())
        }
      }).catch((error) => {
        // rrweb 插件加载失败不影响宿主与核心 SDK
        console.warn('[@sepveneto/report-core] operation record plugin load failed: ' + error)
      })
    }
  } catch (error) {
    console.warn('[@sepveneto/report-core] init failed with error', error)
  }
}

const version = process.env.DEFINE_VERSION
function loadScript(reportUrl: string, entry = 'index.global.js') {
  const script = document.createElement('script')
  const [major, minor] = version?.split('.') || []
  const versionPefix = `${major}.${minor}`
  const url = new URL(reportUrl)
  const coreUrl = `${url.origin}/sdk/${versionPefix}/${entry}?v=${version}`
  script.src = process.env.LOG_DEBUG ? `/public/${entry}` : coreUrl
  script.crossOrigin = 'anonymous'
  return new Promise((resolve, reject) => {
    script.onload = resolve
    script.onerror = reject
    document.body.appendChild(script)
  })
}

// @ts-expect-error: replace
init(SDK_OPTIONS)
