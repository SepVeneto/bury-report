// 在 node 环境下模拟 worker 全局 self。
// 必须在本文件被 import 时立即生效，因此 worker 相关测试文件要把它放在第一个 import 位置。

export const selfState: {
  fetch?: any
  postMessage?: any
  close?: any
} = {}

export const self: any = {
  get fetch() {
    return selfState.fetch
  },
  set fetch(v) {
    selfState.fetch = v
  },
  postMessage: (...args: any[]) => {
    selfState.postMessage?.(...args)
  },
  close: () => {
    selfState.close?.()
  },
}

;(globalThis as any).self = self
