import type { Options } from '@/type'
import { ErrorPlugin } from './plugins/error'
import 'core-js/es/promise/all-settled'

function init(options: Options) {
  try {
    const plugin = new ErrorPlugin()
    plugin.init(options.appid)

    Promise.allSettled([
      loadScript(options.url),
      options.operationRecord?.enable && loadScript(options.url, 'plugins/operationRecord.global.js'),
    ]).then(() => {
      plugin.resetListener()

      if ('BuryReport' in window) {
        if ('OperationRecordPlugin' in window) {
          window.BuryReport.registerPlugin(new window.OperationRecordPlugin())
        }
        // eslint-disable-next-line no-new
        new window.BuryReport(options)
      } else {
        console.warn('[@sepveneto/report-core] cannot find BuryReport  in window, maybe the core script is not loaded correctly')
      }
    })
  } catch (error) {
    console.warn('[@sepveneto/report-core] init failed with error', error)
  }
}

function loadScript(reportUrl: string, entry = 'index.global.js') {
  const script = document.createElement('script')
  const versionPefix = process.env.DEFINE_VERSION?.replace(/^(\d+\.\d+)\.\d+(-.+)$/, '$1$2')
  const url = new URL(reportUrl)
  const coreUrl = `${url.origin}/sdk/${versionPefix}/${entry}`
  script.src = process.env.LOG_DEBUG ? `/public/${entry}` : coreUrl
  // script.src = `/public/${entry}`
  script.crossOrigin = 'anonymous'
  return new Promise((resolve, reject) => {
    script.onload = resolve
    script.onerror = reject
    document.body.appendChild(script)
  })
}

// @ts-expect-error: replace
init(SDK_OPTIONS)
