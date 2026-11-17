type SourceMapSegment = {
  generatedColumn: number
  sourceIndex?: number
  originalLine?: number
  originalColumn?: number
  nameIndex?: number
}

type NormalizedSourceMap = {
  file?: string
  sourceRoot?: string
  sources: string[]
  names: string[]
  sourcesContent: (string | null)[]
  lines: SourceMapSegment[][]
  sections?: {
    line: number
    column: number
    map: NormalizedSourceMap
  }[]
}

export type LoadedSourceMap = {
  key: string
  fileName: string
  file?: string
  map: NormalizedSourceMap
}

export type RestoredFrame = {
  raw: string
  functionName?: string
  generated: {
    file: string
    line: number
    column: number
  }
  original?: {
    source: string
    line: number
    column: number
    name?: string
  }
  mapName?: string
  code: {
    line: number
    text: string
    current: boolean
  }[]
  reason?: string
}

export type RestoredStack = {
  frames: RestoredFrame[]
  matched: number
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const MAX_SOURCE_MAP_SIZE = 50 * 1024 * 1024
const CHROME_LOCATION_RE = /^\s*at\s+(?:(.+?)\s+\()?(.+):(\d+):(\d+)\)?\s*$/
const SAFARI_LOCATION_RE = /^\s*(?:(.+?)@)?(.+):(\d+):(\d+)\s*$/

export async function loadSourceMap(file: File): Promise<LoadedSourceMap> {
  if (file.size > MAX_SOURCE_MAP_SIZE) {
    throw new Error('文件超过 50MB')
  }
  const content = await file.text()
  return parseSourceMap(file.name, content)
}

export function parseSourceMap(fileName: string, content: string): LoadedSourceMap {
  let raw: any
  try {
    raw = JSON.parse(content.replace(/^\uFEFF/, ''))
  } catch {
    throw new Error('不是有效的 JSON')
  }
  if (!raw || raw.version !== 3 || (!raw.mappings && !Array.isArray(raw.sections))) {
    throw new Error('不是有效的 Source Map V3 文件')
  }

  const map = normalizeSourceMap(raw)
  const fallbackFile = fileName.replace(/\.map$/i, '')
  return {
    key: normalizeFileName(raw.file || fallbackFile),
    fileName,
    file: raw.file,
    map,
  }
}

export function restoreStack(
  stack: string,
  sourceMaps: LoadedSourceMap[],
  contextLines = 3,
): RestoredStack {
  const frames: RestoredFrame[] = []

  for (const raw of stack.split(/\r?\n/)) {
    const parsed = parseFrame(raw)
    if (!parsed) continue

    const frame: RestoredFrame = {
      raw: raw.trim(),
      functionName: parsed.functionName,
      generated: parsed.generated,
      code: [],
    }
    const sourceMap = findSourceMap(parsed.generated.file, sourceMaps)
    if (!sourceMap) {
      frame.reason = '未找到匹配的 sourcemap'
      frames.push(frame)
      continue
    }

    const original = lookupOriginalPosition(
      sourceMap.map,
      parsed.generated.line,
      Math.max(0, parsed.generated.column - 1),
    )
    frame.mapName = sourceMap.fileName
    if (!original) {
      frame.reason = '当前位置没有对应的源码映射'
      frames.push(frame)
      continue
    }

    frame.original = {
      source: original.source,
      line: original.line,
      column: original.column,
      name: original.name,
    }

    if (original.content !== null && original.content !== undefined) {
      const sourceLines = original.content.replace(/\r\n?/g, '\n').split('\n')
      const start = Math.max(1, original.line - contextLines)
      const end = Math.min(sourceLines.length, original.line + contextLines)
      for (let line = start; line <= end; line++) {
        frame.code.push({
          line,
          text: sourceLines[line - 1] || '',
          current: line === original.line,
        })
      }
    } else {
      frame.reason = 'sourcemap 未包含源码内容'
    }
    frames.push(frame)
  }

  return {
    frames,
    matched: frames.filter(frame => !!frame.original).length,
  }
}

function normalizeSourceMap(raw: any): NormalizedSourceMap {
  if (Array.isArray(raw.sections)) {
    const sections = raw.sections.map((section: any, index: number) => {
      if (!section?.map) {
        throw new Error(`第 ${index + 1} 个 section 缺少内嵌 map`)
      }
      return {
        line: Number(section.offset?.line || 0),
        column: Number(section.offset?.column || 0),
        map: normalizeSourceMap(section.map),
      }
    })
    return {
      file: raw.file,
      sources: [],
      names: [],
      sourcesContent: [],
      lines: [],
      sections,
    }
  }

  if (!Array.isArray(raw.sources) || typeof raw.mappings !== 'string') {
    throw new Error('sourcemap 缺少 sources 或 mappings')
  }
  return {
    file: raw.file,
    sourceRoot: raw.sourceRoot,
    sources: raw.sources,
    names: Array.isArray(raw.names) ? raw.names : [],
    sourcesContent: Array.isArray(raw.sourcesContent) ? raw.sourcesContent : [],
    lines: decodeMappings(raw.mappings),
  }
}

function decodeMappings(mappings: string): SourceMapSegment[][] {
  let sourceIndex = 0
  let originalLine = 0
  let originalColumn = 0
  let nameIndex = 0

  return mappings.split(';').map(line => {
    let generatedColumn = 0
    const segments: SourceMapSegment[] = []

    for (const value of line.split(',')) {
      if (!value) continue
      const fields = decodeVlqSegment(value)
      generatedColumn += fields[0]

      if (fields.length < 4) {
        segments.push({ generatedColumn })
        continue
      }

      sourceIndex += fields[1]
      originalLine += fields[2]
      originalColumn += fields[3]
      const segment: SourceMapSegment = {
        generatedColumn,
        sourceIndex,
        originalLine,
        originalColumn,
      }
      if (fields.length >= 5) {
        nameIndex += fields[4]
        segment.nameIndex = nameIndex
      }
      segments.push(segment)
    }
    return segments
  })
}

function decodeVlqSegment(value: string) {
  const result: number[] = []
  let index = 0

  while (index < value.length) {
    let number = 0
    let shift = 0
    let continuation = true
    while (continuation) {
      const digit = BASE64.indexOf(value[index++])
      if (digit === -1 || index > value.length) {
        throw new Error('sourcemap mappings 无效')
      }
      continuation = !!(digit & 32)
      number += (digit & 31) << shift
      shift += 5
    }
    const negative = number & 1
    number >>>= 1
    result.push(negative ? -number : number)
  }
  return result
}

function parseFrame(raw: string): {
  functionName?: string
  generated: RestoredFrame['generated']
} | null {
  const line = raw.trim()
  const match = CHROME_LOCATION_RE.exec(line) || SAFARI_LOCATION_RE.exec(line)
  if (!match) return null

  return {
    functionName: match[1]?.trim() || undefined,
    generated: {
      file: match[2],
      line: Number(match[3]),
      column: Number(match[4]),
    },
  }
}

function findSourceMap(file: string, sourceMaps: LoadedSourceMap[]) {
  const target = normalizeFileName(file)
  const targetBase = basename(target)
  let matched: LoadedSourceMap | undefined
  let bestScore = 0

  for (const sourceMap of sourceMaps) {
    const candidates = [
      sourceMap.file,
      sourceMap.key,
    ].filter((item): item is string => !!item)

    for (const candidate of candidates) {
      const normalized = normalizeFileName(candidate)
      let score = 0
      if (target === normalized) {
        score = 100
      } else if (target.endsWith(`/${normalized}`)) {
        score = 80
      } else if (normalized.endsWith(`/${target}`)) {
        score = 60
      } else if (targetBase && targetBase === basename(normalized)) {
        score = 40
      }
      if (score > bestScore) {
        bestScore = score
        matched = sourceMap
      }
    }
  }
  return matched
}

function lookupOriginalPosition(
  map: NormalizedSourceMap,
  line: number,
  column: number,
): {
  source: string
  line: number
  column: number
  name?: string
  content?: string | null
} | null {
  if (map.sections?.length) {
    let section = map.sections[0]
    for (const item of map.sections) {
      if (item.line < line || (item.line === line && item.column <= column)) {
        section = item
      } else {
        break
      }
    }
    const localLine = line - section.line
    const localColumn = localLine === 1 ? column - section.column : column
    return lookupOriginalPosition(section.map, localLine, localColumn)
  }

  const segments = map.lines[line - 1]
  if (!segments?.length) return null

  let segment: SourceMapSegment | undefined
  for (const item of segments) {
    if (item.generatedColumn > column) break
    segment = item
  }
  if (segment?.sourceIndex === undefined || segment.originalLine === undefined || segment.originalColumn === undefined) {
    return null
  }

  const source = resolveSource(map, map.sources[segment.sourceIndex])
  return {
    source,
    line: segment.originalLine + 1,
    column: segment.originalColumn + 1,
    name: segment.nameIndex === undefined ? undefined : map.names[segment.nameIndex],
    content: map.sourcesContent[segment.sourceIndex],
  }
}

function resolveSource(map: NormalizedSourceMap, source: string) {
  if (!map.sourceRoot || /^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(source)) {
    return source
  }
  return `${map.sourceRoot.replace(/\/$/, '')}/${source}`
}

function normalizeFileName(value: string) {
  return value
    .trim()
    .replace(/\\/g, '/')
    .replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '')
    .split(/[?#]/)[0]
    .replace(/\/\.\//g, '/')
    .replace(/\/{2,}/g, '/')
}

function basename(value: string) {
  return value.split('/').filter(Boolean).pop() || value
}
