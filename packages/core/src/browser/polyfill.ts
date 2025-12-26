// iOS 13 WeChat WKWebView has a broken TypedArray.from this-binding behavior.
// bind Uint8Array.from to avoid third-party libraries calling it indirectly.
(function bindTypedArrayFrom() {
  // 避免重复 bind
  if ((Uint8Array.from as any).__bound__) return

  const bound = Uint8Array.from.bind(Uint8Array);
  (bound as any).__bound__ = true

  Uint8Array.from = bound
})()
console.warn('[polyfill] Uint8Array.from patched')
