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
| error | boolean | ❎ | true | 是否自动上报error类型的错误 |
| collect | boolean | ❎ | true | 是否自动上报应用的环境信息 |
| entry | boolean | ❎ | - | 默认是src/main.js和src/main.ts，对于uniapp构建的项目无效 |
| network | { enable: boolean, success: boolean, fail: boolean, responseLimit: number } | ❎ | { enable: false, success: true, fail: true, responseLimit: 100 } | 网络请求的上报配置，其中失败请求包括所有状态码非200的，以及超时和主动取消的, 默认对100KB返回内容进行限制 |
| interval | number | ❎ | 10 | 数据上报的周期，默认每隔10s上传一次

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

每隔固定时间会触发一次上报任务，所有的，包括内存和缓存中的日志都会被收集发送到worker中进行上报。当页面不可见或退出时也会触发一次上报任务。

| 类型 | 缓存 |
| :--- | :--- |
| 自定义日志 | 内存 + localStorage |
| 接口日志 | 内存 |
| 错误日志 | 内存 + localStorage |
| 设备信息 | - |
| 操作日志 | 内存 |

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

基于`rrweb`获取，数据量不可控，只会被存入内存
