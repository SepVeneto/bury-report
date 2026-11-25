type ResourceElement =
  HTMLScriptElement |
  HTMLLinkElement |
  HTMLImageElement |
  HTMLVideoElement |
  HTMLAudioElement |
  HTMLSourceElement

export type NormalizedError = {
  name?: string
  message: string
  stack?: string
  extra?: any
}

export function isSyntaxError(error: NormalizedError) {
  return error.name === 'SyntaxError' ||
    /SyntaxError|Unexpected token|Invalid or unexpected token|Cannot use import statement/.test(error.message || '')
}

export function normalizeResourceError(evt: Event): NormalizedError & { url: string } {
  const target = evt.target as ResourceElement || evt.srcElement

  if (!target) {
    return {
      message: 'Resource load error: unknown target',
      stack: '',
      extra: null,
    }
  }

  const tag = target.tagName.toLowerCase()
  let url = ''
  // @ts-expect-error: ignore
  if (target.src) url = target.src
  // @ts-expect-error: ignore
  if (target.href) url = target.href

  return {
    message: `Resource load error: <${tag}>${url || '(no url)'}`,
    stack: '',
    extra: {
      tag,
      url,
      outerHTML: target.outerHTML.slice(0, 500),
    },
  }
}

export function normalizeError(reason: any) {
  if (reason instanceof Error) {
    let extra = null
    try {
      extra = JSON.stringify(reason)
    } catch {
      extra = '[object with circular structre]'
    }
    return {
      name: reason.name,
      message: reason.message || 'Unknown Error',
      stack: reason.stack || '',
      extra,
    }
  } else if (typeof reason === 'string') {
    return {
      message: reason,
      stack: '',
      extra: null,
    }
  } else if (reason == null) {
    return {
      message: 'null or undefined error',
      stack: '',
      extra: null,
    }
  } else if (typeof reason === 'object') {
    let json = ''
    try {
      json = JSON.stringify(reason)
    } catch {
      json = '[object with circular structre]'
    }

    return {
      message: reason.message || reason.msg || '(object error)',
      stack: reason.stack,
      extra: json,
    }
  } else {
    return {
      message: String(reason),
      stack: '',
      extra: null,
    }
  }
}

export function normalizeConsoleError(args: any[]) {
  if (!args || args.length === 0) {
    return normalizeError('console.error with no arguments')
  }

  for (const a of args) {
    if (a instanceof Error) return normalizeError(a)
  }

  if (typeof args[0] === 'string') {
    const message = args[0]

    let stack = ''
    if (args.length > 1) {
      try {
        stack = JSON.stringify(args.slice(1))
      } catch {
        stack = '[unserializable stack]'
      }
    }

    return {
      message,
      stack,
      extra: null,
    }
  }

  try {
    return normalizeError(args)
  } catch {
    return {
      message: 'console.error unknown structure',
      stack: '',
      extra: null,
    }
  }
}
