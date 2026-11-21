const APP_KEY_PREFIX = '_brBundlerAppKey:'

type MetadataMap = Record<string, Record<string, boolean>>

let cachedSource: MetadataMap | undefined
let cachedByFile = new Map<string, Set<string>>()

export function createModuleMetadataSnippet(applicationKey: string) {
  const key = JSON.stringify(`${APP_KEY_PREFIX}${applicationKey}`)
  return `(function(){try{var w=typeof globalThis<"u"?globalThis:typeof window<"u"?window:typeof self<"u"?self:{};w._brModuleMetadata=w._brModuleMetadata||{};var s=(new w.Error).stack;if(s){var m=w._brModuleMetadata[s]||{};m[${key}]=true;w._brModuleMetadata[s]=m}}catch(e){}})();`
}

export function evaluateThirdPartyFrames(
  stack: string | undefined,
  applicationKey: string | undefined,
) {
  if (!stack || !applicationKey) {
    return {
      recognized: false,
      containsThirdParty: false,
      exclusivelyThirdParty: false,
    }
  }

  const expectedKey = `${APP_KEY_PREFIX}${applicationKey}`
  const byFile = getMetadataByFile()
  const files = extractStackFiles(stack)
  let firstParty = 0

  for (const file of files) {
    const keys = byFile.get(normalizeFilename(file))
    if (keys?.has(expectedKey)) firstParty++
  }

  return {
    recognized: files.length > 0,
    containsThirdParty: files.length > 0 && firstParty < files.length,
    exclusivelyThirdParty: files.length > 0 && firstParty === 0,
  }
}

function getMetadataByFile() {
  const metadata: MetadataMap = (window as any)._brModuleMetadata || {}
  if (metadata === cachedSource) return cachedByFile

  const next = new Map<string, Set<string>>()
  for (const [metadataStack, values] of Object.entries(metadata)) {
    for (const filename of extractStackFiles(metadataStack)) {
      const normalized = normalizeFilename(filename)
      const keys = next.get(normalized) || new Set<string>()
      for (const key of Object.keys(values || {})) {
        if (key.startsWith(APP_KEY_PREFIX)) keys.add(key)
      }
      next.set(normalized, keys)
    }
  }
  cachedSource = metadata
  cachedByFile = next
  return next
}

function extractStackFiles(stack: string) {
  const files: string[] = []
  for (const line of String(stack).split('\n')) {
    const match = line.match(/([^\s()]+):\d+:\d+\)?$/)
    if (match?.[1] && !match[1].startsWith('native')) files.push(match[1])
  }
  return files
}

function normalizeFilename(filename: string) {
  return filename.replace(/[?#].*$/, '')
}
