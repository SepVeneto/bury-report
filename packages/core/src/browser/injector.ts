import type { Options } from '@/type'
import { ErrorPlugin } from './plugins/error'

function init(options: Options) {
  try {
    const plugin = new ErrorPlugin()
    plugin.init(options.appid)

    const script = document.createElement('script')
    const versionPefix = process.env.DEFINE_VERSION?.split('.').slice(0, -1).join('.')
    const coreUrl = `${options.url.replace('record', '')}sdk/${versionPefix}/index.global.js`
    script.src = coreUrl
    script.crossOrigin = 'anonymous'
    script.onload = () => {
      plugin.resetListener()

      if ('BuryReport' in window) {
        // eslint-disable-next-line no-new
        new window.BuryReport(options)
      } else {
        console.warn('[@sepveneto/report-core] cannot find BuryReport  in window, maybe the core script is not loaded correctly')
      }
    }

    document.body.appendChild(script)
  } catch (error) {
    console.warn('[@sepveneto/report-core] init failed with error', error)
  }
}

// @ts-expect-error: replace
init(SDK_OPTIONS)
