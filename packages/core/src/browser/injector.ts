import type { Options } from '@/type'
import { ErrorPlugin } from './plugins/error'

function init(options: Options) {
  const plugin = new ErrorPlugin()
  plugin.init(options.appid)

  const script = document.createElement('script')
  const coreUrl = `${options.url.replace('record', '')}sdk/index.global.js?v=${process.env.DEFINE_VERSION}`
  script.src = coreUrl
  script.crossOrigin = 'anonymous'
  script.onload = () => {
    plugin.resetListener()

    // @ts-expect-error: window
    // eslint-disable-next-line no-new
    new BuryReport(options)
  }

  document.head.appendChild(script)
}

// @ts-expect-error: replace
init(SDK_OPTIONS)
