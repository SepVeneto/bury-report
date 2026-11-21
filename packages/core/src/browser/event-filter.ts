import type { Options } from '@/type'
import { evaluateThirdPartyFrames } from './module-metadata'

type Pattern = string | RegExp

type ErrorLike = {
  name?: string
  message: string
  stack?: string
  extra?: any
  tags?: Record<string, any>
}
// Sentry 默认过滤项中与不可归因浏览器噪音相关的部分。
export const DEFAULT_IGNORE_ERRORS: Pattern[] = [
  /^Script error\.?$/,
  /^Javascript error: Script error\.? on line 0$/,
  /^ResizeObserver loop completed with undelivered notifications.$/,
  /^Cannot redefine property: googletag$/,
  /can't redefine non-configurable property "solana"/,
  /vv\(\)\.getRestrictions is not a function/,
  /^undefined is not an object \(evaluating 'a\.[A-Z]'\)$/,
]

const INTERNAL_MARKER = /@sepveneto\/report-core/

export function shouldIgnoreError(
  error: ErrorLike,
  options: Partial<Options> = {},
  sourceUrl?: string,
) {
  try {
    const url = sourceUrl || extractErrorUrl(error)
    const ignoreErrors = [...DEFAULT_IGNORE_ERRORS, ...(options.ignoreErrors || [])]
    const allowMatched = !!url && !!options.allowUrls?.length && matchesPattern(url, options.allowUrls)

    if (matchesPattern(error.message || '', ignoreErrors)) return true
    if (url && matchesPattern(url, options.denyUrls)) return true
    if (url && options.allowUrls?.length && !allowMatched) return true
    if (options.ignoreInternal !== false && isInternalError(error, url)) return true

    const thirdParty = evaluateThirdPartyFrames(error.stack, options.applicationKey)
    if (allowMatched) return false
    if (
      thirdParty.recognized &&
      (options.thirdPartyErrors === 'drop' ||
        options.thirdPartyErrors === 'drop-error-if-exclusively-contains-third-party-frames') &&
      thirdParty.exclusivelyThirdParty
    ) return true
    if (
      thirdParty.recognized &&
      options.thirdPartyErrors === 'drop-error-if-contains-third-party-frames' &&
      thirdParty.containsThirdParty
    ) return true
    if (
      thirdParty.recognized &&
      (options.thirdPartyErrors === 'apply-tag-if-exclusively-contains-third-party-frames') &&
      thirdParty.exclusivelyThirdParty
    ) {
      error.tags = { ...error.tags, third_party_code: true }
    }
    if (
      thirdParty.recognized &&
      options.thirdPartyErrors === 'apply-tag-if-contains-third-party-frames' &&
      thirdParty.containsThirdParty
    ) {
      error.tags = { ...error.tags, third_party_code: true }
    }

    return false
  } catch {
    // 自定义规则异常只影响过滤结果，不能让业务错误监听器或请求链路抛错
    return false
  }
}

export function shouldIgnoreNetworkRequest(
  requestUrl: string,
  options: Partial<Options> = {},
) {
  try {
    const reportUrl = options.url
    if (reportUrl && requestUrl === reportUrl) return true
    if (matchesPattern(requestUrl, options.network?.ignoreUrls)) return true
    if (options.network?.allowUrls?.length && !matchesPattern(requestUrl, options.network.allowUrls)) return true
    return false
  } catch {
    return false
  }
}

export function matchesPatterns(value: string, patterns?: Pattern[]) {
  return matchesPattern(value, patterns)
}

function matchesPattern(value: string, patterns?: Pattern[]) {
  if (!patterns?.length) return false
  return patterns.some(pattern => {
    if (!(pattern instanceof RegExp)) return value.includes(pattern)
    // 避免用户传入 /g 或 /y 正则时 lastIndex 让同一规则结果发生漂移
    pattern.lastIndex = 0
    return pattern.test(value)
  })
}

function extractErrorUrl(error: ErrorLike) {
  const extra = error.extra
  if (extra && typeof extra === 'object' && typeof extra.url === 'string') return extra.url
  if (extra && typeof extra === 'object' && typeof extra.filename === 'string') return extra.filename

  const stack = error.stack || ''
  const matches = stack.match(/(?:https?|file|chrome-extension|moz-extension|ms-browser-extension|safari-extension|safari-web-extension):\/\/[^\s)]+/g)
  return matches?.[matches.length - 1]
}

function isInternalError(error: ErrorLike, sourceUrl?: string) {
  const text = `${error.name || ''} ${error.message || ''} ${error.stack || ''} ${sourceUrl || ''}`
  return INTERNAL_MARKER.test(text)
}
