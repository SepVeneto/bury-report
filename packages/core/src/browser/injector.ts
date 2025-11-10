import type { Options } from '@/type'
import { ErrorPlugin } from './plugins/error'

function init(options: Options) {
  try {
    const plugin = new ErrorPlugin()
    plugin.init(options.appid)

    Promise.all([
      loadScript(options.url),
      loadScript(options.url, 'plugins/operationRecord.global.js'),
    ]).then(() => {
      plugin.resetListener()

      if ('BuryReport' in window) {
        window.BuryReport.registerPlugin(new window.OperationRecordPlugin())
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
  const versionPefix = process.env.DEFINE_VERSION?.split('.').slice(0, -1).join('.')
  const coreUrl = `${reportUrl.replace('record', '')}sdk/${versionPefix}/${entry}`
  script.src = coreUrl
  script.crossOrigin = 'anonymous'
  return new Promise(resolve => {
    script.onload = resolve
    document.body.appendChild(script)
  })
}

// @ts-expect-error: replace
init(SDK_OPTIONS)
