## 环境变量

| 名称 | 描述 | 示例 |
| --- | --- | ----- |
| REPORT_DB_URL | 连接的数据库地址 | db:port |
| JWT_SECRET | JWT 签名密钥，生产环境必须设置 | 随机长字符串 |
| REDIS_HOST | 连接的redis地址 | redis:port |
| INTERNAL_TOKEN | 内网请求使用的token | 123456 |
| TOTP_ISSUER | 身份验证器中显示的服务名称 | Bury Report |
| DB_NAME | 数据库用户名 | test |
| DB_PWD | 数据库密码 | 123456 |
| NOTIFY_TOKEN | log请求使用的token（将会和INTERNAL_TOKEN统一） | 123456 |
| NOTIFY_URL | log服务的地址 | http://log:123456 |
| KAFKA_BROKERS | 连接的kafka地址 | redpanda-0:port |
| REGION | 云存储桶所在地域 | -- |
| BUCKET | 云存储桶名称 | -- |
| SECRECT_ID | COS密钥ID | -- |
| SECRECT_KEY | COS密钥KEY | -- |
| DEBUG | 调试模式 | -- |
| NETDATA_URL | netdata服务地址 | http://netdata:123456 |
| NETDATA_PUSH | netdata数据的推送地址 | -- |
| SALT | 密码盐 | -- |

## 初始管理员

首次连接到空数据库时，服务会根据 `ADMIN_NAME` 和 `ADMIN_PASSWORD` 创建管理员，默认值为 `admin` / `Admin123456`。已有数据库可以使用以下命令显式创建或重置管理员密码：

```shell
pnpm bootstrap:admin
```

该命令会读取 `packages/server/.env.local`，生产环境执行前请先在登录页确认现有管理员不受影响。

## 账号安全

账号管理支持直接切换账号启用状态。当前账号可以通过二维码绑定基于 TOTP 的双因素验证；开启后登录时需要输入身份验证器生成的 6 位动态码。管理员可以重置任意账号的双因素验证，用于身份验证器丢失后的恢复。

管理员可以为普通账号配置可查看项目。普通账号只能获取已授权项目，访问未授权项目的应用 API 会返回 403；新增项目默认不会自动授权给已有普通账号。

新创建账号会标记为待初始化。首次登录时服务端只签发短期初始化凭证，必须先重置临时密码并完成 TOTP 绑定，之后才会签发正常会话令牌。

正常会话 JWT 有效期为 30 天。每次认证请求会通过 `x-access-token` 响应头签发新的 30 天令牌，前端收到后自动更新本地 token。
