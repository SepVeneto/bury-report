export function initErrorProxy(reportFn: (...args: any[]) => void) {
  const _tempError = console.error
  console.error = function (...args) {
    for (const arg of args) {
      if (arg instanceof Error) {
        const error = {
          name: arg.name,
          message: arg.message,
          stack: arg.stack,
        }
        reportFn(error)
        break
      }
      if (globalThis.PromiseRejectionEvent && arg instanceof PromiseRejectionEvent) {
        const error = {
          name: arg.reason.name,
          message: arg.reason.message,
          stack: arg.reason.stack,
        }
        reportFn(error)
        break
      } else {
        console.warn(args)
        console.warn(arg, typeof arg, Object.prototype.toString.call(arg))
      }
    }
    _tempError.apply(this, args)
  }
}
