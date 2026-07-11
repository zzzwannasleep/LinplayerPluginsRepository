# UHDNow 线路测速

一站式测试 UHDNow 各条线路的下载速度，对应官网 [/speed](https://www.uhdnow.com/speed) 的测速功能。

## 使用

1. 安装启用后，到「设置 → 插件 → UHDNow 线路测速 → 账号设置」填写 uhdnow **网站**账号密码
   （若与添加 Emby 服务器时填的账密相同，可不填，会自动回退使用）。
2. 打开「开始测速」，确认后逐条线路测速，结果按速度从快到慢展示。

## 原理

登录拿 token 后：

1. `GET /api/v1/subscriptions/domains` 取线路列表；
2. 每条线路 `.../resolve` 解析出真实基址；
3. `POST {线路}/api/v1/speed-test/session` 建会话；
4. `GET {线路}/api/v1/speed-test/download?size_mb=&session_id=` 下载测试文件并计时；
5. `POST /api/v1/speed-test/report` 上报（与官网一致）。

## 注意

- **会消耗账户流量**：每条线路下载约「测试大小」MiB（默认 10，可在账号设置调，上限 20）。
- 测速为客户端粗测（对整段下载计时），仅供参考，受本机网络与代理影响。
- **未设置 `httpAllowedHosts`**：线路真实域名是运行时动态解析的，无法预先写死白名单，
  因此本插件允许访问任意 HTTPS 主机（仍强制 HTTPS）。介意可自行改 manifest 收紧。

## 权限

`emby.read`（读服务器信息/回退账密用）、`emby.credentials`、`http`、`storage`、`ui`、`extensions`。
