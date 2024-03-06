let queue: Record<string, any>[] = []

export function createQueue(interval: number, reportFn: (records: Record<string, any>[]) => void) {
  setInterval(() => {
    if (queue.length === 0) {
      return
    }
    reportFn(queue)
    queue = []
  }, interval * 1000)
  return queue
}
