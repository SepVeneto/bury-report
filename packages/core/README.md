# @sepveneto/report-core

[![NPM version](https://img.shields.io/npm/v/%40sepveneto%2Freport-core)](https://www.npmjs.com/package/@sepveneto/report-core)

适用于web和uniapp的日志上报插件

## 浏览器通过外部脚本直接使用

```html
<html>
  <script>
    const sdk = document.createElement('script')
    sdk.src = 'https://remote/sdk/index.global.js'
    sdk.onload = function () {
      new BuryReport({
        url: 'http://remote/record',
        appid: 'appid',
        collect: true,
        report: true,
        interval: 5,
        network: {
          enable: true,
        },
      })
    }
  </script>
</html>
```

## 快速开始

小程序端需预留出大小约`6KB`的空间

H5 构建时会将轻量 loader 以内联脚本的形式放到文档 `<head>` 最前面。loader 会先缓存
`error`、`unhandledrejection` 和 `console.error`，待核心 SDK 加载完成后统一回放，
因此 SDK 初始化前的错误不会丢失，也不会额外阻塞首屏。

```cmd
npm i -D @sepveneto/report-core
yarn add -D @sepveneto/report-core
pnpm i -D @sepveneto/report-core
```

<details>
<summary>Vite</summary><br>

```ts
// vite.config.ts
import Reporter from '@sepveneto/report-core/vite'

export default defineConfig({
  plugins: [
    Reporter({ /* options */ }),
  ],
})
```

Example: [`playground/`](./playground/)

<br></details>

<details>
<summary>Uniapp v2</summary><br>

```ts
module.exports = {
  configureWebpack: {
    plugins: [
      require('@sepveneto/report-core/webpack').default({ /* options */ }),
    ]
  }
}
```
<br></details>


<details>
<summary>Webpack</summary><br>

```ts
// webpack.config.js
module.exports = {
  /* ... */
  plugins: [
    require('@sepveneto/report-core/webpack').default({ /* options */ })
  ]
}
```

<br></details>

<details>
<summary>Vue CLI</summary><br>

```ts
// vue.config.js
module.exports = {
  configureWebpack: {
    plugins: [
      require('@sepveneto/report-core/webpack').default({ /* options */ }),
    ],
  },
}
```

<br></details>

## 选项
| 名称 | 类型 | 必填 | 默认值 | 说明 |
| :--- | :--- | :-- | :--- | :--- |
| url | string | ✅ | - | 日志上报接口 |
| appid | string | ✅ | - | 用来区分每一个应用的id |
| report | boolean | ❎ | process.env.NODE.ENV === 'production' | 是否发送上报请求。 |
| error | boolean | ❎ | true | 是否自动上报运行时错误（如JS错误、Promise拒绝） |
| collect | boolean | ❎ | true | 是否自动上报应用的环境信息 |
| fcpThreshold | number | ❎ | 2500 | FCP 资源清单采集阈值，单位毫秒。web-vitals 指标始终上报；只有 FCP 超过该阈值时才收集并上报资源清单 |
| entry | boolean | ❎ | - | 默认是src/main.js和src/main.ts，对于uniapp构建的项目无效 |
| network | { enable: boolean, success: boolean, fail: boolean, responseLimit: number, ignoreUrls?: Array<string \| RegExp>, allowUrls?: Array<string \| RegExp> } | ❎ | { enable: false, success: true, fail: true, responseLimit: 100 } | 网络请求上报配置；支持忽略第三方/埋点接口 URL 或设置 URL 白名单 |
| interval | number | ❎ | 10 | 数据上报的周期，默认每隔10s上传一次 |
| maxRetry | number | ❎ | 5 | 连续失败达到该次数后采用最大退避间隔。网络失败不会停止 SDK、录屏或采集；设为0或负数时保持基础上报间隔 |
| ignoreErrors | Array<string \| RegExp> | ❎ | Sentry 常用默认噪音 | 按错误消息过滤不可归因噪音 |
| denyUrls | Array<string \| RegExp> | ❎ | - | 按错误来源 URL 过滤 |
| allowUrls | Array<string \| RegExp> | ❎ | - | 设置错误来源白名单，同时可用于放行指定 CDN/第三方脚本 |
| ignoreInternal | boolean | ❎ | true | 过滤 SDK 自身产生的错误 |
| applicationKey | string | ❎ | - | 构建时写入所有业务 JS chunk；运行时通过错误 stack 中的文件名匹配该 key |
| thirdPartyErrors | Sentry 同款四种模式或 `drop`/`keep` | ❎ | `keep` | 基于 chunk key 判断业务帧与第三方帧，可丢弃或打 `third_party_code` 标签 |

`thirdPartyErrors` 支持：

- `drop-error-if-contains-third-party-frames`
- `drop-error-if-exclusively-contains-third-party-frames`
- `apply-tag-if-contains-third-party-frames`
- `apply-tag-if-exclusively-contains-third-party-frames`

`drop` 等价于只丢弃完全由第三方帧组成的错误。未配置 `applicationKey` 时不做
chunk 级第三方判断。

页面隐藏或触发 `pagehide` 时，`__BR_PERF_INFO__` 会通过 `web-vitals`
上报 FCP、LCP、INP 和 TTFB，单位均为毫秒。FCP 超过 `fcpThreshold` 时，
同一记录还会包含 `startTime <= LCP` 的 Resource Timing 资源清单，清单中的
请求仍用 FCP 标记发起和完成阶段；总数超过 200 条时，FCP 前后两个阶段各保留 100 条。

| 字段 | 说明 |
| :--- | :--- |
| perfVersion | 性能数据协议版本，当前为 `2` |
| fcp / lcp / inp / ttfb | `web-vitals` 计算后的指标值，单位毫秒；无对应指标时为 `null` |
| ratings | 各项指标的 `good`、`needs-improvement`、`poor` 评级 |
| resourceCount | 资源总数，不受 200 条清单上限影响 |
| resourcesBeforeFcp | FCP 前发起的资源数量 |
| resourcesAfterFcp | FCP 后发起的资源数量 |
| resourcesCompletedBeforeFcp | 在 FCP 前完成的资源数量 |
| resourcesCompletedAfterFcp | 在 FCP 后完成的资源数量 |
| url | 请求地址，最长保留 1000 字符 |
| type | Resource Timing 的 `initiatorType`，包括 `script`、`link`、`fetch`、`xmlhttprequest` 等 |
| phase | `before-fcp`、`after-fcp` 或 `unknown` |
| responsePhase | 按请求完成时间相对 FCP 的位置标记 |
| startTime | 请求开始时间，单位毫秒 |
| responseEnd | 请求完成时间，单位毫秒 |
| responseTime | `responseEnd - requestStart`，单位毫秒；跨域资源未配置 Timing-Allow-Origin 时为 `null` |
| duration | 资源总耗时 `duration`，单位毫秒 |

### 关于占用空间
使用的上报功能不同，需要的空间大小也不一样

| 功能 | 相关配置 | 预计占用大小 | 说明 |
| :--- | :------ | :---------- | :--- |
| 基础上报(自定义上报) | report | 1KB | 前置设定，关闭后影响其它功能 |
| js错误上报 | error | 2KB | - |
| 环境收集 | collect | 1KB | - |
| 网络请求上报 | network.enable | 4KB | 成功请求和失败请求的上报对大小影响可以忽略不计 |

占用大小不包含基础上报功能, 压缩工具`terser`

## 方法
| 名称 | 参数 | 说明 |
| :--- | :-- | :-- |
| report | (type: string, data: any, immediate: boolean) => void | 主动上报数据，当immediate开启时，会立刻将本地缓存的数据上报一次（错误信息与环境信息必定会立即上报 |

## 说明

1. 应用会在启动时自动收集当前所在的环境信息并进行上报。

2. 同时会重写console.error，在执行该方法时同样会自动上报这个错误

3. 除此之外可以通过手动导入`report`来自定义上报的时机和内容
```ts
import { report } from '@sepveneto/report-core'

report('error', 'test content')
```

## 关于如何区分设备
在应用第一次启动时会自动生成一个设备id并存储在本地缓存中，因此一旦用户换设备或者缓存丢失都会导致设备计算出现误差

## 上报逻辑

支持自定义日志，接口日志，错误日志，操作日志，设备信息。每种类型都有不同的上报逻辑

每隔固定时间会触发一次上报任务。普通日志由主线程传输层发送；录屏批次交给
worker 独立处理。页面不可见或退出时也会触发一次 keepalive 上报。

| 类型 | 缓存 |
| :--- | :--- |
| 自定义日志 | 内存 + localStorage |
| 接口日志 | 有界内存 |
| 错误日志 | 内存 + localStorage |
| 设备信息 | - |
| 操作日志 | worker 有界 spool（IndexedDB + 内存） |

### 自定义日志

自定义日志支持配置`immediate`和`cache`。

| 名称 | 类型 | 默认值 | 说明 |
| :--- | :--- | :----- | :--- |
| immediate | boolean | false | 是否立即上报, 默认会随着定时任务的触发上报，开启后会立刻触发一次上报 |
| cache | boolean | true | 是否缓存, 开启后会先将数据存入本地缓存中，适用于关键数据或者少量数据 |

### 接口日志

接口日志的大小不可控，而本地缓存是同步操作，数据量一旦过大会影响主进程，因此只会在内存中放置并等待上报。

### 错误日志

错误日志往往相对较小，并比较重要。为了防止意外关闭导致关键日志丢失，会先存入本地缓存中。

### 设备信息

设备信息仅会在打开应用时立即触发一次，不会被缓存在任何地方。

### 操作日志

基于 `rrweb` 获取，数据量不可控。主线程只在 worker 确认接收前短暂持有，
接收后立即释放；worker 使用 IndexedDB 持久化，并同时限制：

- 最多 20 个录屏批次；
- 总估算体积不超过 16MB；
- 长期离线时只做指数退避，最长 5 分钟一次；
- 超限时淘汰最旧录屏批次，不挤占普通日志队列或浏览器 localStorage。

### 业务隔离与长期离线

上报链路遵循“只能影响上报结果，不能影响业务执行”：

- 发送失败、持久化失败、worker 失败或过滤规则异常都不会向业务抛出；
- 服务端响应不参与上报判定；请求完成即视为已投递，网络错误才进入保留和重试流程；
- 长期离线不会中止错误监听、网络代理或录屏采集；
- 普通日志队列上限约 512KB，超限优先淘汰接口噪音，保留环境、错误和生命周期记录；
- `store:false` 的主线程缓存同时受 500 条和 4MB 限制；
- 网络恢复时监听 `online` 事件立即补发，不必等待下一个退避周期。
