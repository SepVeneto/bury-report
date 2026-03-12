## 环境变量

| 名称 | 描述 | 示例 |
| --- | --- | ----- |
| REPORT_DB_URL | 连接的数据库地址 | db:port |
| REDIS_HOST | 连接的redis地址 | redis:port |
| INTERNAL_TOKEN | 内网请求使用的token | 123456 |
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
