# @sepveneto/report-core

[![NPM version](https://img.shields.io/npm/v/%40sepveneto%2Freport-core)](https://www.npmjs.com/package/@sepveneto/report-core)

适用于web和uniapp的日志上报插件

## 快速开始

```cmd
npm i -D @sepveneto/report-core
yarn add -D @sepveneto/report-core
pnpm i -D @sepveneto/report-core
```

<details>
<summary>Vite</summary><br>

```ts
// vite.config.ts
import Reporter from '@sepveneto/report-core'

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
      require('@sepveneto/report-core/webpack')({ /* options */ }),
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
    require('@sepveneto/report-core')({ /* options */ })
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
      require('@sepveneto/report-core')({ /* options */ }),
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
| error | boolean | ❎ | true | 是否自动上报error类型的错误 |
| collect | boolean | ❎ | true | 是否自动上报应用的环境信息 |

## 方法
| 名称 | 参数 | 说明 |

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
