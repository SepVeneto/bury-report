# @sepveneto/report-core 测试用例

## 运行方式

```bash
# 全量用例（28 个文件 / 287 个用例）
pnpm test

# 覆盖率（v8，输出 text + html 到 ./coverage）
pnpm test:coverage
```

> 覆盖率报告依赖 `@vitest/coverage-v8@1.6.1`（与 vitest 1.6.1 配套）。
> 为避免改动锁文件引入无关依赖漂移，它没有写入 devDependencies，
> 首次使用请先安装一次：
>
> ```bash
> pnpm -C packages/core add -D @vitest/coverage-v8@1.6.1
> pnpm -C packages/core test:coverage
> ```

## 覆盖率

`src` 全量统计（`coverage.all = true`，未加载的源文件也计入）：

| 指标 | 结果 |
| --- | --- |
| Statements | 99.42% |
| Branches | 95.41% |
| Functions | 100% |
| Lines | 99.42% |

剩余未覆盖行均为防御性/不可达代码，见文末说明。

## 可靠性加固（对应两条硬约束）

针对"上报链路的任何异常都绝不能影响业务执行"与"在不影响业务性能的前提下尽量保证数据完整性"，本轮做了如下加固，并在 `test/resilience.spec.ts` 中固化（这些用例在修复前均为红灯）。

### 要求1：绝不影响业务执行

| 位置 | 加固内容 |
| --- | --- |
| `src/index.ts` | `report` / `reportNetwork` 整体 try/catch，SDK 内部异常不再外泄到业务调用方 |
| `src/browser/index.ts`、`src/mp-uni/index.ts` | `report` 代理整体 try/catch；`options` 为 `null` / 非对象时不抛错 |
| `src/utils.ts` | `flushMemoryToStorage` 全链路兜底；单条记录不可序列化（循环引用 / BigInt）时只丢弃该条，不再让整条队列被"毒丸"卡死 |
| `src/browser/plugins/network.ts` | XHR 各事件监听器内的采集逻辑包裹 `safeCollect`，采集异常不再变成全局未捕获错误 |
| `src/mp-uni/plugins/network.ts` | 采集异常不影响宿主的 `success` / `fail` 回调（回调必定执行） |
| `src/browser/plugins/error.ts`、`src/mp-uni/plugins/error.ts` | 无论上报是否成功都执行宿主原本的 `console.error`，且原函数自身异常同样不外泄 |
| `src/browser/worker.ts` | `handleReport` 的 rejection 被捕获，畸形消息只告警 |

### 要求2：服务端失败不丢客户端数据

| 位置 | 加固内容 |
| --- | --- |
| `src/mp-uni/index.ts` | `uni.request` 的 `success` 带有 `statusCode`，只有 2xx 才清队列，5xx 保留并重试 |
| `src/browser/index.ts` + `src/utils.ts` | keepalive 受浏览器总量配额（约 64KB）约束：按预算截取后发送，未发出的部分写回队列，下次会话补发 |
| `src/utils.ts` | `normalizeResponse` 达到上限即提前返回；`limit === Infinity` 时不做截断也不全量扫描 |
| `src/utils.ts` | flush 全流程只做一次整表序列化（裁剪复用已算出的体积） |

> 浏览器端仍是 fire-and-forget（`no-cors`，不读响应状态）。服务端 5xx 的兜底需要服务端按 `(uuid, stamp)` 幂等去重，之后可再开启"冗余重发"，需服务端确认。

### 性能（同一基准，改前 → 改后）

| 场景 | 改前 | 改后 |
| --- | --- | --- |
| `normalizeResponse` 5MB / limit=1 | 15.95ms | 0.07ms |
| `normalizeResponse` 5MB / limit=Infinity | 17.35ms | 0.01ms |
| `flushMemoryToStorage` 50×100KB | 49.84ms | 29.88ms |
| `flushMemoryToStorage` 稳态 242KB | 2.74ms | 2.10ms |
| `report()` 业务热路径 | 2.15µs/次 | 2.13µs/次 |

热路径无变化（差异在噪声范围）；新增兜底均为 try/catch 与 `options || {}` 判断，正常路径零额外开销。

## 用例分布

### 公共入口

| 文件 | 覆盖内容 |
| --- | --- |
| `test/index.spec.ts` / `test/index-extra.spec.ts` | `report` / `setCustomId` / `reportNetwork` 的转发、`REPORT_REQUEST` 缺失或非函数时的降级、非字符串入参告警 |
| `test/entries.spec.ts` | `vite` / `webpack` / `rspack` 入口导出、`type.ts` 抽象基类的运行时可继承性 |
| `test/lib.spec.ts` | `getMainEntry` / `isEntry` 的平台分支、`transformInclude`、小程序端代码注入、vite（H5 脚本标签）/ webpack（bodyTags）/ rspack（assets 注入）适配 |
| `test/injector.spec.ts` / `test/misc-extra.spec.ts` | 核心脚本按版本拼接与加载、`BuryReport` 初始化、rrweb 插件异步注册、加载失败兜底、`DEFINE_VERSION` / `LOG_DEBUG` 分支 |

### 浏览器端

| 文件 | 覆盖内容 |
| --- | --- |
| `test/browser.spec.ts` / `test/browser-extra.spec.ts` | 网络异常/配置错误不拖累宿主、worker 创建失败与异常终止降级、重试与队列保留、keepalive 分片、并发发送保护、`flush` / `store` 选项、生命周期上报与录屏插件联动 |
| `test/browser-plugins.spec.ts` / `test/network-extra.spec.ts` | NetworkPlugin 的 success/fail 开关、传输异常（abort/error/timeout）、体积与响应头截断、performance profile 采集 |
| `test/error-branches.spec.ts` / `test/error-console.spec.ts` / `test/error-extra.spec.ts` | ErrorPlugin 的错误归一化（Error/字符串/对象/null/循环引用）、资源与脚本错误、console.error 代理兜底 |
| `test/collect-info.spec.ts` | CollectPlugin 的环境采集：iOS/Android/iPadOS/Windows/macOS/Linux/Other 识别、浏览器与 IE 版本、屏幕方向、主题、窗口尺寸与 CSS 变量边距、iOS 横屏屏幕修正 |
| `test/perf.spec.ts` / `test/edge-cases.spec.ts` | PerfPlugin 的 FCP 上报、隐藏时间与超时判定、iframe 判定、observer 生命周期 |
| `test/operation-record.spec.ts` / `test/operation-record-extra.spec.ts` | 录屏批处理、检查点重建、路由懒快照与节流、rAF/setTimeout 兜底、增强插件观察器、原子上报 |
| `test/worker.spec.ts` / `test/worker-extra.spec.ts` | worker 内部上报：分片、gzip 录屏协议、失败重试与上限、排序、未知消息 |
| `test/polyfill.spec.ts` / `test/misc-extra.spec.ts` | iOS13 `Uint8Array.from` 手动实现与幂等性 |

### 小程序端

| 文件 | 覆盖内容 |
| --- | --- |
| `test/mp-uni.spec.ts` / `test/mp-uni-extra.spec.ts` | 上报周期与失败重试、`store:false` 内存缓存上限、无可发送数据时不请求、`report` 独立 API |
| `test/mp-plugins.spec.ts` / `test/mp-extra.spec.ts` / `test/error-extra.spec.ts` | CollectPlugin 新旧接口兼容、ErrorPlugin 的 onError/onUnhandledRejection 归一化、TrackPlugin 的 App/Page 生命周期包装与耗时统计、插件注册与初始化异常隔离 |

### 工具与可靠性

| 文件 | 覆盖内容 |
| --- | --- |
| `test/utils.spec.ts` / `test/utils-extra.spec.ts` | 配置合并、uuid/session 缓存与降级、队列读写与损坏回退、内存缓冲 flush、条数/字节上限与设备信息保护、UTF-8 体积、分片、间隔校验 |
| `test/resilience.spec.ts` | 不可序列化数据不打断调用方且不毒化队列、公共 API 与网络采集异常不外泄、小程序 statusCode 判定、keepalive 预算与剩余数据保留、体积计算提前退出与预算裁剪 |

## 不可达/防御性代码说明

以下行无法通过用例触达，属于实现上的死代码或兜底分支：

- `src/utils.ts:91-92`：`getUtf8Size` 中 `code > 0xFFFF` 的分支，`charCodeAt` 不可能超过 `0xFFFF`（代理对已在前置分支处理）。
- `src/index.ts:11`：`args || []` 的兜底，rest 参数恒为数组。
- `src/browser/plugins/error.ts:132-137`：`normalizeResourceError` 的 `!target` 分支，调用方已保证 `target` 为真。
- 纯兜底 catch（正常路径不会触发，仅用于保证异常不外泄）：`src/utils.ts:410-411`、`src/browser/index.ts:307-308`、`src/mp-uni/index.ts:147-148`、`src/browser/plugins/error.ts:115-116`、`src/mp-uni/plugins/error.ts:100-101`。

## 测试过程中发现的实现问题

以下行为已在用例中按现状固化，建议后续确认：

1. `src/mp-uni/plugins/collect.ts` 读取的是 `getAppBaseInfo().hostFontSizeSetting`，而 uni 接口返回字段为 `fontSizeSetting`，导致 `hfs` 始终取不到值。
2. `src/lib.ts` 中 Vite/Webpack/Rspack 注入的 SDK 配置会剔除 `entry`，但小程序端 `transform` 注入的 `new BuryReport(config)` 仍包含 `entry`，会把构建机路径带进产物。
3. `IEVersion()` 中的正则为 `/MSIE (\\d+\\.\\d+);/`（多了一层转义，实际匹配字面量 `\d`），因此 IE 版本号依赖 `RegExp.$1` 的静态残留，行为不可预期。
4. 浏览器端 `mode: 'no-cors'` 无法区分 2xx / 5xx，服务端失败会被视作已投递。已通过 keepalive 预算与"未发送数据保留"降低损失，彻底解决需服务端幂等（或改用可读响应）。

### 尚未实施（待确认）

- 冗余重发（同一批数据重发 N 次）：需服务端按 `(uuid, stamp)` 幂等，否则会产生重复数据；同时建议记录补充单调 `seq`，避免同毫秒同类型记录撞幂等键。
- `BuryReport.cache` / `memoryOnly` 仍按条数限流（50 / 20 条），未按字节限流，超大录屏批次仍可能占用较多内存。
- `immediate` 上报会在业务调用栈上同步完成 flush 与序列化；改为异步可进一步降低业务侧开销，但会改变"立即上报"的既有语义，需单独确认。
