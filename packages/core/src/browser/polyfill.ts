// iOS 13 WeChat WKWebView 的原生 %TypedArray%.from 对 (string, mapFn) 等直接调用
// 也会抛 "TypedArray.from requires its this argument subclass a TypedArray constructor"。
// 用 bind 修复无效（直接调用时 this 本来就是正确的），这里用手动实现完全绕开原生实现。
(function patchTypedArrayFrom() {
  // 避免重复 patch
  if ((Uint8Array.from as any).__patched__) return

  function patchedFrom(arrayLike: any, mapFn?: (value: number, index: number) => any, thisArg?: any) {
    const list = Array.from(arrayLike as any)
    const mapped = mapFn ? list.map((value, index) => mapFn.call(thisArg, value, index)) : list
    const result = new Uint8Array(mapped.length)
    for (let i = 0; i < mapped.length; i++) result[i] = mapped[i]
    return result
  }

  ;(patchedFrom as any).__patched__ = true
  Uint8Array.from = patchedFrom as any
})()
console.warn('[polyfill] Uint8Array.from patched')
