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
   * 是否自动上报应用的环境信息
   * @default true
   */
  error?: boolean
  /**
   * 是否自动上报
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
     * 是否启用接口错误（包括超时和拒绝）请求的上报
     * @default true
     */
    fail?: boolean
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

export type ReportFn = (
  type: string,
  data: Record<string, any>,
  immediate?: boolean,
) => void
export abstract class BuryReportBase {
  public abstract report?: ReportFn
  public abstract options: Options
}
export abstract class BuryReportPlugin {
  public abstract name: string

  public abstract init: (ctx: BuryReportBase) => void
}
