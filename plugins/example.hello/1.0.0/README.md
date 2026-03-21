# Website + Network Example Plugin（示例）

## 简介

这个示例按新版 `SPEC.md` 重写，集中演示三件事：

- 用 `openUrl` 打开外部网站
- 用受控 `webview` 把网站作为页面里的辅助块
- 用 `ctx.net.request()` 发起最小网络请求，并把结果映射成结构化 UI

## 支持平台

- `pc`
- `mobile`

## 页面和插槽

- 页面：`/plugin/example.hello/home`
- 插槽：无

## 依赖的外部站点 / 接口

- `https://www.bilibili.com/`
- `https://httpbin.org/get`

## 权限

- `permissions.network.enabled = true`
- `permissions.network.domains = ["httpbin.org", "bilibili.com", "www.bilibili.com"]`

## 这个示例重点展示什么

- `section`、`card`、`button`、`webview`
- `loading / empty / error / ready` 状态切换
- `openUrl` 和 `toast`
- `ctx.net.request()` 的最小写法

## 已知限制

- `webview` 只是辅助展示块，不应该替代整页 UI
- `webview` 内页面拿不到插件 `ctx`
- 如果网页后续跳到白名单外域名，宿主可能拦截或转到外部浏览器
