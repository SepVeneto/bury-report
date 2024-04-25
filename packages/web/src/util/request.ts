import axios from 'axios'
import * as NProgress from 'nprogress'
import OSS from 'ali-oss'
import { sign } from '@rx-frontend/php-sign'
import 'nprogress/nprogress.css'
import { ElMessage, ElNotification } from 'element-plus'
import type { AxiosRequestConfig, AxiosResponse } from 'axios'

interface Response<T = any> {
  code: number;
  message: string;
  data: T;
}

sign.SIGN_KEY = import.meta.env.VITE_APP_SIGNKEY
let isRedirect = false

const inst = axios.create({
  baseURL: import.meta.env.VITE_APP_BASEURL,
})

export const requestInspector = (config: AxiosRequestConfig<any>) => {
  NProgress.start()
  // config.data = sign(config.data)
  const token = localStorage.getItem('token')
  if (!token) {
    // window.location.href = '#/login'
  } else {
    config.headers = {
      ...config.headers,
      authorization: token,
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

inst.interceptors.request.use(requestInspector)
inst.interceptors.response.use(responseInspector, responseError)

export function request<T>(
  config: AxiosRequestConfig & { raw?: false },
  needTip?: boolean | string
): Promise<T>
export function request<T>(
  config: AxiosRequestConfig & { raw: true },
  needTip?: boolean | string
): Promise<AxiosResponse<Response<T>>>
export function request<T>(
  config: AxiosRequestConfig & { raw: 'data' },
  needTip?: boolean | string
): Promise<Response<T>>
export async function request(
  config: AxiosRequestConfig,
  needTip?: boolean | string,
) {
  const res = await inst(config)

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

export const axiosInstance = inst

function fileDownload(data: Blob, name: string) {
  const node = document.createElement('a')
  const link = URL.createObjectURL(data)
  node.href = link
  name && (node.download = name)
  document.body.appendChild(node)
  node.click()
  document.body.removeChild(node)
}

export async function uploadFile(file: File, name?: string, onlyDownload = false) {
  try {
    const fileName = name || file.name
    const { save_path, credentials_data } = (
      await uploadOssData(name || file.name)
    )
    const client = new OSS({
      region: credentials_data.region,
      accessKeyId: credentials_data.access_key_id,
      accessKeySecret: credentials_data.access_key_secret,
      stsToken: credentials_data.sts_token,
      bucket: credentials_data.bucket,
    })
    const res = await client.put(save_path, file, onlyDownload ? { headers: { 'Content-Disposition': '*' } } : undefined)
    const fileUrl = (
      await uploadOssSave({
        name: fileName,
        size: file.size,
        mime: file.type,
        url: res.url,
        md5: (res.res.headers as any).etag,
      })
    )
    return fileUrl
  } catch (e: any) {
    throw new Error(e)
  }
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

/**
 * OSS上传-获取配置
 * @param {string} name 文件名称
 */
export function uploadOssData(name: string) {
  return request<IOssData>({
    url: '/Admin/Common/Common/uploadOssData',
    method: 'post',
    data: {
      name,
    },
  })
}

export interface IOssSave {
  size: number,
  mime: string,
  name: string,
  url: string,
  md5: string,
}

/**
 * OSS上传-保存信息
 */
export function uploadOssSave(data: IOssSave) {
  return request<{ url: string }>({
    url: '/Admin/Common/Common/uploadOssSave',
    method: 'post',
    data,
  })
}

export class Restful {
  private resource: string
  constructor(resource: string) {
    this.resource = resource
  }

  get prefix() {
    return this.resource.endsWith('/') ? this.resource : this.resource + '/'
  }

  list<Req, Res>(params: Req) {
    return request<Res>({
      url: this.resource,
      method: 'get',
      params,
      raw: 'data',
    })
  }

  detail<Res>(name: string | number) {
    return request<Res>({
      url: this.prefix + name,
      method: 'get',
    })
  }

  create<Req>(data: Req) {
    return request({
      url: this.prefix,
      method: 'post',
      data,
    }, true)
  }

  edit<Req>(name: string | number, data: Req) {
    return request({
      url: this.prefix + name,
      method: 'put',
      data,
    }, true)
  }

  delete(name: string | number) {
    return request({
      url: this.prefix + name,
      method: 'delete',
    }, true)
  }
}
