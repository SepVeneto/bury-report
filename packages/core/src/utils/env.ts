export const IS_UNIAPP = globalThis.process && !!process.env.UNI_PLATFORM
export const IS_UNI_WEIXIN = globalThis.process && process.env.UNI_PLATFORM === 'mp-weixin'
