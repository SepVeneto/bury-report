import axios from 'axios'
import * as NProgress from 'nprogress'
import { sign } from '@rx-frontend/php-sign'
import 'nprogress/nprogress.css'
import { ElMessage, ElNotification } from 'element-plus'
import type { AxiosRequestConfig, AxiosResponse } from 'axios'
import { useApp } from '@/store'

interface Response<T = any> {
  code: number;
  message: string;
  data: T;
}

sign.SIGN_KEY = import.meta.env.VITE_APP_SIGNKEY
let isRedirect = false

const serverInst = axios.create({
  baseURL: import.meta.env.VITE_APP_SERVER_BASEURL,
})
const reportInst = axios.create({
  baseURL: import.meta.env.VITE_APP_REPORT_BASEURL,
})

export const requestInspector = (config: AxiosRequestConfig<any>) => {
  NProgress.start()
  // config.data = sign(config.data)
  const token = localStorage.getItem('token')
  if (!token) {
    // window.location.href = '#/login'
  } else {
    const app = useApp()
    config.headers = {
      ...config.headers,
      authorization: token,
      appid: app.appid,
    }
  }
  return config
}

export const responseInspector = async (response: AxiosResponse<Response>) => {
  NProgress.done()
  if (response.data instanceof Blob) {
    const res = response.data
    if (res.type === 'application/json') {
      response.data = JSON.parse(await res.text())
    }
  }
  const { code, message } = response.data
  if (code === 4) {
    const redirect = window.location.hash.replace('#', '')
    if (!isRedirect) {
      isRedirect = true
      window.location.href = `#/login?redirect=${encodeURIComponent(redirect)}`
    }
  }
  if (code && code !== 0) {
    ElNotification.error(message)
    return Promise.reject(message)
  }
  return response
}

export const responseError = (err: any) => {
  if ([403, 401].includes(err.response.status)) {
    const redirect = window.location.hash.replace('#', '')
    if (!isRedirect) {
      isRedirect = true
      window.location.href = `#/login?redirect=${encodeURIComponent(redirect)}`
    }
  }
  NProgress.done()
  ElNotification({
    title: '请求异常',
    message: err.message,
    type: 'error',
  })
}

serverInst.interceptors.request.use(requestInspector)
serverInst.interceptors.response.use(responseInspector, responseError)
reportInst.interceptors.request.use(requestInspector)
reportInst.interceptors.response.use(responseInspector, responseError)

export function reportRequest<T>(
  config: AxiosRequestConfig & { raw?: false },
  needTip?: boolean | string
): Promise<T>
export function reportRequest<T>(
  config: AxiosRequestConfig & { raw: true },
  needTip?: boolean | string
): Promise<AxiosResponse<Response<T>>>
export function reportRequest<T>(
  config: AxiosRequestConfig & { raw: 'data' },
  needTip?: boolean | string
): Promise<Response<T>>
export async function reportRequest(
  config: AxiosRequestConfig,
  needTip?: boolean | string,
) {
  const res = await reportInst(config)

  if (res.data instanceof Blob) {
    const disposition = res.headers['content-disposition']
    const filename = decodeURIComponent(
      escape(
        disposition.substring(
          disposition.indexOf('filename=') + 9,
          disposition.length,
        ),
      ),
    )
    try {
      fileDownload(res.data, config.filename || filename)
    } catch (e) {
      return Promise.reject(e)
    }
    return null as any
  }

  if (needTip) {
    ElMessage.success(typeof needTip === 'string' ? needTip : res.data.message)
  }
  if (typeof config.raw === 'string') {
    return res[config.raw]
  }
  return config.raw ? res : res.data?.data
}

export function serverRequest<T>(
  config: AxiosRequestConfig & { raw?: false },
  needTip?: boolean | string
): Promise<T>
export function serverRequest<T>(
  config: AxiosRequestConfig & { raw: true },
  needTip?: boolean | string
): Promise<AxiosResponse<Response<T>>>
export function serverRequest<T>(
  config: AxiosRequestConfig & { raw: 'data' },
  needTip?: boolean | string
): Promise<Response<T>>
export async function serverRequest(
  config: AxiosRequestConfig,
  needTip?: boolean | string,
) {
  const res = await serverInst(config)

  if (res.data instanceof Blob) {
    const disposition = res.headers['content-disposition']
    const filename = decodeURIComponent(
      escape(
        disposition.substring(
          disposition.indexOf('filename=') + 9,
          disposition.length,
        ),
      ),
    )
    try {
      fileDownload(res.data, config.filename || filename)
    } catch (e) {
      return Promise.reject(e)
    }
    return null as any
  }

  if (needTip) {
    ElMessage.success(typeof needTip === 'string' ? needTip : res.data.message)
  }
  if (typeof config.raw === 'string') {
    return res[config.raw]
  }
  return config.raw ? res : res.data?.data
}

function fileDownload(data: Blob, name: string) {
  const node = document.createElement('a')
  const link = URL.createObjectURL(data)
  node.href = link
  name && (node.download = name)
  document.body.appendChild(node)
  node.click()
  document.body.removeChild(node)
}

export interface IOssData {
  save_path: string,
  credentials_data: {
    access_key_id: string,
    bucket: string,
    access_key_secret: string,
    sts_token: string,
    region: string,
  }
}

export interface IOssSave {
  size: number,
  mime: string,
  name: string,
  url: string,
  md5: string,
}

export class Restful {
  protected resource: string
  constructor(resource: string) {
    this.resource = resource
  }

  list<Req, Res>(params: Req) {
    return reportRequest<Res>({
      url: this.resource,
      method: 'get',
      params,
      raw: 'data',
    })
  }

  protected normalizeUrl(prefix: string, resource: string) {
    const _res = prefix.endsWith('/') ? prefix : prefix + '/'
    return _res + resource
  }

  detail<Res>(name: string | number) {
    return reportRequest<Res>({
      url: this.normalizeUrl(this.resource, String(name)),
      method: 'get',
    })
  }

  create<Req>(data: Req) {
    return reportRequest({
      url: this.resource,
      method: 'post',
      data,
    }, true)
  }

  edit<Req>(name: string | number, data: Req) {
    return reportRequest({
      url: this.normalizeUrl(this.resource, String(name)),
      method: 'put',
      data,
    }, true)
  }

  delete(name: string | number) {
    return reportRequest({
      url: this.normalizeUrl(this.resource, String(name)),
      method: 'delete',
    }, true)
  }
}
