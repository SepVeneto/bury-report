# @sepveneto/report-core

[![NPM version](https://img.shields.io/npm/v/%40sepveneto%2Freport-core)](https://www.npmjs.com/package/@sepveneto/report-core)

适用于web和uniapp的日志上报插件

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
| network | { enable: boolean, success: boolean, fail: boolean } | ❎ | { enable: false, success: true, fail: true } | 网络请求的上报配置，其中失败请求包括所有状态码非200的，以及超时和主动取消的 |
| interval | number | ❎ | 10 | 数据上报的周期，默认每隔10s上传一次

### 关于占用空间
使用的上报功能不同，需要的空间大小也不一样

| 功能 | 相关配置 | 预计占用大小 | 说明 |
| :--- | :------ | :---------- | :--- |
| 基础上报(自定义上报) | report | 1KB | 前置设定，关闭后影响其它功能 |
| js错误上报 | error | 2KB | - |
| 环境收集 | collect | <1KB | - |
| 网络请求上报 | network.enable | 4KB | 成功请求和失败请求的上报对大小影响可以忽略不计 |

占用大小不包含基础上报功能, 压缩工具`terser`

## 方法
| 名称 | 参数 | 说明 |
| :--- | :-- | :-- |
| report | (type: string, data: any) => void | 主动上报数据 |

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
