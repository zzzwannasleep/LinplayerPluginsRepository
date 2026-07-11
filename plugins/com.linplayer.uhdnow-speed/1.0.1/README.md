# UHDNow 线路测速

一站式测试 UHDNow 各条线路的下载速度，对应官网 [/speed](https://www.uhdnow.com/speed)。

## 使用

1. 「设置 → 插件 → UHDNow 线路测速 → 账号设置」填 uhdnow **网站**账号密码
   （与添加 Emby 服务器时相同则可不填，自动回退）。顺便选测试文件大小：**32 / 64 / 100 MiB**（对标官网，默认 32）。
2. 打开「开始测速」，确认后逐条线路测速，结果按速度从快到慢展示。

## 原理

登录拿 token 后：`GET /subscriptions/domains` 取线路 → `.../resolve` 解析真实基址 →
`POST {线路}/speed-test/session` 建会话 → `GET {线路}/speed-test/download?size_mb=&session_id=`
下载测试文件并计时 → `POST /speed-test/report` 上报（与官网一致）。

下载走 `ctx.http` 的 **discardBody**（按流丢弃、只计字节数），所以 100 MiB 也不会撑爆插件内存。

## 注意

- **需宿主 build 含 `ctx.http` 的 discardBody 支持**（本次随插件一起提交的宿主改动）。
  旧版宿主上大文件会退回缓冲模式，64 MiB 以上可能内存吃紧——请用配套的新 build。
- **会消耗账户流量**：每条线路下载「测试大小」MiB，测 N 条 = N × 大小。运行前有二次确认。
- 客户端粗测（对整段下载计时），仅供参考，受本机网络/代理影响。

## 权限

`emby.read`、`emby.credentials`、`http`（限 uhdnow 线路域名白名单）、`storage`、`ui`、`extensions`。
