import { Cron } from 'croner'

export class TaskManager {
  private static taskMap: Map<string, Cron> = new Map()
  static get names() {
    return this.taskMap.values().map(item => item.name).toArray()
  }
  static add(jobId: string, task: Cron) {
    if (this.taskMap.has(jobId)) {
      this.remove(jobId)
    }
    this.taskMap.set(jobId, task)
  }
  static remove(jobId: string) {
    const task = this.taskMap.get(jobId)
    if (!task) {
      return
    }
    task.stop()
    this.taskMap.delete(jobId)
  }
  static immediate(jobId: string) {
    const task = this.taskMap.get(jobId)
    if (!task) {
      console.warn('task not found')
      return
    }
    task.trigger()
  }
}
