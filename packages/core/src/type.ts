export interface Options {
  /**
   * 项目的入口文件
   */
  entry?: string
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
  /**
   * 是否发送上报请求
   * 默认在开发模式(NODE_ENV == 'development')时关闭，生产模式(NODE_ENV == 'production')时开启
   */
  report?: boolean
  /**
   * 网络请求相关配置
   */
  network?: {
    /**
     * 关闭后将不会扩展原生的请求方式，停止所有网络请求的上报
     */
    enable?: boolean
    /**
     * 是否启用接口慢请求的上报
     */
    slow?: boolean
    /**
     * 是否启用接口错误（包括超时和拒绝）请求的上报
     */
    error?: boolean
    /**
     * 慢请求上报的阈值，单位毫秒
     */
    timeout?: number
  }
}
