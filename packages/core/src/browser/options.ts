const REGEXP_MARKER = '__BR_REGEXP__'

type SerializedRegExp = {
  [REGEXP_MARKER]: string
  flags: string
}

/**
 * Build-time options are JSON embedded in the inline loader. RegExp values need
 * an explicit marker because JSON.stringify would otherwise serialize them as {}.
 */
export function serializeOptions(options: Record<string, any>) {
  return JSON.stringify(options, (_key, value) => {
    if (value instanceof RegExp) {
      return {
        [REGEXP_MARKER]: value.source,
        flags: value.flags,
      } satisfies SerializedRegExp
    }
    return value
  })
}

export function reviveOptions<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(item => reviveOptions(item)) as T
  }
  if (!value || typeof value !== 'object') return value

  const candidate = value as Record<string, any>
  if (typeof candidate[REGEXP_MARKER] === 'string') {
    try {
      return new RegExp(candidate[REGEXP_MARKER], candidate.flags || '') as T
    } catch {
      return value
    }
  }

  const revived: Record<string, any> = {}
  for (const key of Object.keys(candidate)) {
    revived[key] = reviveOptions(candidate[key])
  }
  return revived as T
}
