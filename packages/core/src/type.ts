// import type { BuryReport } from './browser'

export interface Options {
  /**
   * 数据上报周期, 单位秒，默认10秒
   * @default 10
   */
  interval?: number
  /**
   * 项目的入口文件
   */
  entry?: string
  /**
   * 用来区分每 应用的
   */
  appid: string
  /**
   * 日志上报接口
   */
  url: string
  /**
   * 构建时的时间戳
   */
  stamp?: string
  /**
   * FCP 资源清单采集阈值，单位毫秒。
   * web-vitals 指标始终上报；只有 FCP 超过该阈值时，才额外采集并上报
   * 从页面开始到 LCP 为止发起的 Resource Timing 资源清单。
   * @default 2500
   */
  fcpThreshold?: number
  /**
   * 是否自动上报运行时错误（如JS错误、Promise拒绝）
   * @default true
   */
  error?: boolean
  /**
   * 是否自动上报应用的环境信息
   * @default true
   */
  collect?: boolean
  /**
   * 是否发送上报请求
   * 默认在开发模式(NODE_ENV == 'development')时关闭，生产模式(NODE_ENV == 'production')时开启
   * @default NODE_ENV === 'production'
   */
  report?: boolean
  /**
   * 连续失败多少次后进入最大退避间隔。
   * 达到该次数不会停止 SDK，队列会保留并在网络恢复后继续发送。
   * 设为 0 或负数表示始终使用基础上报间隔。
   * @default 5
   */
  maxRetry?: number
  /**
   * 错误消息过滤规则，支持字符串和正则。
   * 与 Sentry 的 ignoreErrors 行为一致。
   */
  ignoreErrors?: Array<string | RegExp>
  /**
   * 要过滤的错误来源 URL 规则。优先于 allowUrls。
   */
  denyUrls?: Array<string | RegExp>
  /**
   * 仅采集匹配这些来源 URL 的错误。未配置时不做来源白名单限制。
   */
  allowUrls?: Array<string | RegExp>
  /**
   * 是否过滤 SDK 自身产生的错误。
   * @default true
   */
  ignoreInternal?: boolean
  /**
   * 构建时写入应用 chunk 的标识。运行时按错误 stack 匹配该标识，
   * 用于区分业务代码和第三方脚本。
   */
  applicationKey?: string
  /**
   * 第三方 chunk 错误处理策略，行为与 Sentry thirdPartyErrorFilterIntegration 对齐。
   * @default 'keep'
   */
  thirdPartyErrors?:
    | 'keep'
    | 'drop'
    | 'drop-error-if-contains-third-party-frames'
    | 'drop-error-if-exclusively-contains-third-party-frames'
    | 'apply-tag-if-contains-third-party-frames'
    | 'apply-tag-if-exclusively-contains-third-party-frames'
  /**
   * 网络请求相关配置
   */
  network?: {
    /**
     * 支持上报的大小限制，单位KB
     * @default 100
     */
    responseLimit?: number,
    /**
     * 关闭后将不会扩展原生的请求方式，停止所有网络请求的上报
     * @default false
     */
    enable?: boolean
    /**
     * 是否上报所有成功发出的请求
     * @default true
     */
    success?: boolean
    /**
     * 是否上报失败的请求（非200状态码、超时、主动取消）
     * @default true
     */
    fail?: boolean
    /**
     * 要忽略的请求 URL 规则。
     */
    ignoreUrls?: Array<string | RegExp>
    /**
     * 仅采集匹配这些 URL 的请求。未配置时不做来源白名单限制。
     */
    allowUrls?: Array<string | RegExp>
  },
  /**
   * 是否记录用户操作，仅h5支持
   */
  operationRecord?: {
    enable?: boolean
    /**
     * 快照检查点重建间隔（毫秒），默认 5s。
     * 周期生成 FullSnapshot 作为回放恢复点：某段快照丢失/拍错时，回放可从下一个检查点继续。
     * 注意：checkout 是事件驱动的，仅在持续录制的片段内有效；短片段场景请配合
     * 回到页面时的可见性快照（重建检查点）使用。
     * 设为 0 可关闭。
     */
    checkoutEveryNms?: number
    /**
     * 快照中是否内联样式表，默认 false。
     * 内联会显著增大快照体积，增大超传输限制被丢弃的概率。
     */
    inlineStylesheet?: boolean
  }
}

export interface RuntimeOptions {
  uniPlatform?: string
}

export interface AsyncCallback<R = void, E = any> {
  success?: (res: R) => void;
  fail?: (error: E) => void;
  complete?: (res?: R | E) => void;
  [other: string]: any;
}

interface RequestParams<R> extends AsyncCallback<{
  data: R,
  statusCode: number;
  header?: Record<string, string>;
  cookies?: string[];
}> {
  url: string;
  data?: string | object | ArrayBuffer;
  header?: Record<string, string>;
  timeout?: number;
  method?:
    | 'GET'
    | 'POST'
    | 'PUT'
    | 'DELETE'
    | 'HEAD'
    | 'OPTIONS'
    | 'TRACE'
    | 'CONNECT';
  dataType?: 'json';
  responseType?: 'text' | 'arraybuffer';
  enableHttp2?: boolean;
  enableQuic?: boolean;
  enableCache?: boolean;
}

export type MPSDK = {
  setStorageSync: (key: string, data: any) => void
  getStorageSync: (key: string) => any
  request: <R>(params: RequestParams<R>) => any
}

export type ReportOptions = {
  /**
   * 是否立即上报
   * 由于上报时会强制把内存刷新到缓存中，因此不要和flush同时开启
   *
   * 默认不会
   * @default false
   */
  immediate?: boolean,
  /**
   * 是否定时存入本地缓存
   *
   * 默认是开启的，只有开启状态才会刷新数据到本地缓存
   * @default true
   */
  store?: boolean,
  /**
   * 是否立即刷新本地缓存
   * 该操作会立即将内存中的数据写入本地缓存中
   * 如果是希望数据不被持久化，需要关闭store
   *
   * 换句话说，在关闭store后，flush的控制是没有意义的
   *
   * 默认不会立即刷新，而是定时刷新
   * @default fasle
   */
  flush?: boolean,
  /**
   * 页面关闭后是否保持连接（与sendBeacon功能类似）
   *
   * 默认不会
   * @default false
   */
  keepalive?: boolean,
}

export type ReportFn = (
  type: string,
  data: Record<string, any>,
  options?: ReportOptions
) => void
export abstract class BuryReportBase {
  public abstract report?: ReportFn
  public abstract options: Options
}
export abstract class BuryReportPlugin {
  public abstract name: string

  public abstract init: (ctx: BuryReportBase) => void

  /**
   * 停止该插件产生的所有采集/上报行为。
   * 上报重试耗尽后由 SDK 调用，用于中止上报相关的操作（如录屏、错误监听等）。
   */
  public destroy?: (ctx: BuryReportBase) => void
}
