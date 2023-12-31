export interface Options {
  /**
   * 用来区分每一个应用的
   */
  appid: string
  /**
   * 日志上报接口
   */
  url: string
  /**
   * 是否自动上报应用的环境信息
   */
  error?: boolean
  /**
   * 是否自动上报
   */
  collect?: boolean
}
