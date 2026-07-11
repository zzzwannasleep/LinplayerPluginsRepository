# UHDNow 线路测速

从线路列表里选一条 UHDNow 线路测下载速度，全程进度可视化。对应官网 [/speed](https://www.uhdnow.com/speed)。

## 使用

1. 「设置 → 插件 → UHDNow 线路测速 → 账号设置」填 uhdnow **网站**账号密码（同 Emby 可不填）。
2. 打开「开始测速」→ 弹出**线路列表**点选一条 → 选测试大小（32 / 64 / 100 MiB，对标官网）。
3. 弹出进度面板，实时显示进度条、当前速度、平均速度；结束给出平均 / 峰值 / MB·s。

## 原理

登录 → `GET /subscriptions/domains` 取线路 → `.../resolve` 解析真实基址 → 分段（每段 8 MiB，
每段独立 `speed-test/session`）`GET .../speed-test/download` 并计时，用 `ctx.http` 的 discardBody
按流丢弃只计字节 → 每段刷新进度面板 → `POST /speed-test/report` 上报一次。总下载量 = 所选大小。

## 注意

- **需较新宿主 build**：依赖 `ctx.ui.showList` / `showProgress`、`ctx.http` discardBody，以及
  修正后的「空转看门狗」超时（交互流程不再被 30s 误杀）。旧 build493 不具备，请用新 build。
- **会消耗账户流量**：一次测速 = 所选大小。客户端粗测，仅供参考。

## 权限

`emby.read`、`emby.credentials`、`http`（限 uhdnow 线路域名白名单）、`storage`、`ui`、`extensions`。
