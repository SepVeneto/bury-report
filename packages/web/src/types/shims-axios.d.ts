declare module 'axios' {
  import { AxiosResponse } from 'axios'
  export interface AxiosRequestConfig {
    // 返回值是否保留原始response结构
    raw?: boolean | keyof AxiosResponse
    // 对下载的文件进行重命名
    filename?: string
  }
}

export {}
