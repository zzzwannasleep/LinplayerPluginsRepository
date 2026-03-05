# 插件市场与脚本插件规范（v1）

本规范用于「**脚本插件 + 宿主渲染（DSL/UI Schema）**」的插件体系，支持 Flutter 全端（TV/移动/PC）共用协议，市场按端分发。

## 1. 术语

- **宿主（Host/App）**：你的 Flutter 应用本体，负责 UI 渲染、播放器、网络能力、存储、调度等。
- **插件仓库（Market Repo）**：独立 GitHub 仓库，存放插件文件与索引。
- **插件（Plugin）**：一个 `pluginId` 下的一个或多个版本。
- **版本（Version）**：语义化版本（SemVer），例如 `1.2.3`。
- **目标端（target）**：`tv` / `mobile` / `pc`。
- **Manifest**：插件清单文件 `manifest.json`，描述入口、权限、扩展点、文件哈希等。
- **Registry**：市场索引 `registry.json`，用于网页展示与客户端查更新。
- **Blocked**：下架/禁用清单 `blocked.json`，用于 kill switch。
- **UI Schema / DSL**：插件返回的声明式 UI 描述，宿主将其渲染为 Flutter Widgets。

## 2. 仓库结构（推荐）

```text
.
├─ registry.json
├─ blocked.json
├─ schemas/
└─ plugins/
   └─ <pluginId>/
      └─ <version>/
         ├─ manifest.json
         └─ main.js
```

说明：
- 一个插件一个文件夹（`plugins/<pluginId>/`）
- 每个版本一个子目录（`plugins/<pluginId>/<version>/`）
- 不使用 GitHub Releases 打包：宿主按 `manifest.json` 的 `files[]` 列表逐个下载文件
- 图标可选：如需在市场页展示，可在版本目录放入 `icon.svg` 或 `icon.png`，并把它们加入 `files[]`

## 3. 安装链接（复制到 App）

安装链接必须指向某个版本目录下的 `manifest.json`（GitHub Raw 链接）：

```text
https://raw.githubusercontent.com/<owner>/<repo>/<ref>/plugins/<pluginId>/<version>/manifest.json
```

**强烈建议 `<ref>` 使用 tag 或 commit SHA**（不可变），不要使用 `main`。

原因：如果链接可变，攻击者可同时篡改脚本与 `manifest.json` 里的 `sha256`，绕过完整性校验。

## 4. 安全与治理（最低要求）

### 4.1 完整性校验（必须）

- `manifest.json` 必须包含 `files[]`，每个文件包含 `path/size/sha256`
- 宿主必须在安装/升级时对每个文件做 `sha256` 校验，不通过则失败

### 4.2 下架/禁用（必须）

- 插件仓库根目录提供 `blocked.json`
- 宿主在安装前与启动时定期拉取 `blocked.json`
- 命中规则时：禁止安装 / 自动停用，并展示原因（如有）

### 4.3 最小权限（建议）

本期需求仅开放网络权限，但建议仍采用「能力型 API」：
- 插件不能直接拥有 socket/http，而是调用宿主 `net.request()`
- 插件可完全自定义 `User-Agent` / headers / cookieJar，但宿主仍可做超时/限流/响应大小上限/审计日志

## 5. manifest.json 规范

### 5.1 顶层字段（v1）

必填字段：
- `schemaVersion`：固定为 `1`
- `id`：插件唯一 ID（建议反向域名，如 `com.example.plugin`）
- `name`：展示名
- `description`：简介
- `version`：插件版本（SemVer）
- `apiVersion`：插件 API 版本（整数，v1 固定为 `1`）
- `minHostVersion`：最低宿主版本（SemVer）
- `targets`：支持端列表（`tv`/`mobile`/`pc`）
- `entry`：各端入口脚本
- `permissions`：权限声明（v1 至少 `network`）
- `files`：文件清单（含 sha256）

可选字段：
- `author`：`{ name, homepage }`
- `homepage` / `site`：插件主页
- `license`：许可证
- `tags`：标签数组
- `contributions`：扩展点声明
- `settingsSchema`：宿主生成插件设置页的表单 DSL

### 5.2 entry（入口）

```json
{
  "entry": {
    "tv": { "script": "main.js" },
    "mobile": { "script": "main.js" },
    "pc": { "script": "main.js" }
  }
}
```

- `targets` 包含哪个端，`entry` 就必须包含对应 key
- `script` 必须出现在 `files[].path` 中，并能被下载/校验

### 5.3 permissions（权限）

v1 仅定义网络权限：

```json
{
  "permissions": {
    "network": {
      "enabled": true,
      "domains": ["*"]
    }
  }
}
```

- `domains`：允许访问的域名白名单；`"*"` 表示不限制（你当前倾向）
- 宿主仍应做：超时、并发限制、最大响应大小

### 5.4 files（文件清单）

```json
{
  "files": [
    { "path": "main.js", "size": 1234, "sha256": "64位十六进制" }
  ]
}
```

说明：图标并非必需；如需在市场页展示，可添加 `icon.svg` 或 `icon.png`，并把它们加入 `files[]`。

规则：
- `path` 必须是相对路径、使用 `/` 分隔
- 禁止出现 `..`、绝对路径、盘符
- `sha256` 小写 64 位十六进制

### 5.5 contributions（扩展点）

`contributions` 用于告诉宿主“这个插件能提供什么”。v1 支持：
- `pages`：新增页面（宿主渲染 UI Schema）
- `dataSources`：数据源（搜索/列表/详情）
- `playSources`：播放源解析（返回可播放 URL/headers/字幕等）
- `tasks`：自动化任务（触发器 + run）
- `uiComponents`：自定义 UI 组件（Schema 级）

所有 handler 都是**入口脚本中定义的全局函数名**（字符串）。宿主通过脚本引擎调用这些函数。

#### 5.5.1 pages

```json
{
  "pages": [
    {
      "id": "home",
      "title": "首页",
      "route": "/plugin/example/home",
      "targets": ["tv", "mobile", "pc"],
      "render": "page_home_render",
      "onEvent": "page_home_onEvent"
    }
  ]
}
```

- `render(ctx, params, state)` -> `PageRenderResult`
- `onEvent(ctx, event, state)` -> `PageEventResult`

#### 5.5.2 dataSources

```json
{
  "dataSources": [
    {
      "id": "search",
      "title": "搜索",
      "cacheTtlSeconds": 60,
      "params": [{ "name": "q", "title": "关键词", "type": "input", "value": "" }],
      "list": "ds_search_list"
    }
  ]
}
```

- `list(ctx, params)` -> `DataPage`
- 可选：`detail(ctx, params)` -> `DataDetail`

#### 5.5.3 playSources

```json
{
  "playSources": [
    { "id": "resolver", "title": "解析器", "resolve": "play_resolve" }
  ]
}
```

- `resolve(ctx, item)` -> `Playable`

#### 5.5.4 tasks

```json
{
  "tasks": [
    {
      "id": "refresh",
      "title": "刷新缓存",
      "targets": ["mobile", "pc"],
      "triggers": [{ "type": "cron", "expr": "0 */6 * * *" }],
      "run": "task_refresh_run"
    }
  ]
}
```

注意：移动端/TV 的后台执行能力受系统限制，宿主需做降级（例如仅前台触发或提示不可用）。

#### 5.5.5 uiComponents

```json
{
  "uiComponents": [
    { "id": "rating_badge", "schemaType": "plugin.ratingBadge", "render": "ui_ratingBadge_render" }
  ]
}
```

- 插件通过返回 `type: "plugin.ratingBadge"` 的节点复用该组件
- 宿主必须维护组件白名单（尤其 TV 端）

### 5.6 settingsSchema（插件设置表单 DSL）

用于宿主自动生成插件设置页（可选）：

```json
{
  "settingsSchema": [
    { "name": "tmdbKey", "title": "TMDB Key", "type": "secret", "value": "" },
    { "name": "language", "title": "语言", "type": "enumeration", "value": "zh-CN",
      "enumOptions": [{ "title": "中文", "value": "zh-CN" }, { "title": "English", "value": "en-US" }] }
  ]
}
```

字段建议：
- `input` / `textarea` / `number` / `boolean`
- `enumeration`（下拉）
- `secret`（加密存储/不回显）
- `constant`（只读）

## 6. 宿主与脚本运行时契约（v1）

### 6.1 调用约定

- 宿主加载 `entry.<target>.script` 并执行（eval）后，脚本必须在全局作用域定义被 `manifest` 引用的函数
- 宿主通过脚本引擎调用：`globalThis[handlerName](ctx, ...)`

### 6.2 ctx（上下文对象）

宿主传入 `ctx`，建议包含：
- `ctx.target`：`tv|mobile|pc`
- `ctx.locale`：如 `zh-CN`
- `ctx.timeZone`：如 `Asia/Shanghai`
- `ctx.hostVersion`：宿主版本
- `ctx.plugin`：`{ id, version }`
- `ctx.settings`：插件设置（由宿主持久化）
- `ctx.net.request(req)`：网络请求能力
- `ctx.storage.get/set/remove`：插件私有 KV 存储
- `ctx.log(level, message, extra?)`：日志

### 6.3 net.request（网络）

请求对象建议：
```js
{
  url: "https://example.com",
  method: "GET",
  headers: { "User-Agent": "xxx" },
  body: null,
  timeoutMs: 15000,
  responseType: "text" // text|json|bytes
  cookieJarId: "default"
}
```

响应对象建议：
```js
{ status: 200, headers: { ... }, url: "最终URL", body: "..." }
```

原则：
- 插件可以自行设置 UA/headers
- 宿主不应强制注入全局 UA（或至少允许插件覆盖）
- 宿主必须实现超时、并发限制、最大响应大小

## 7. UI Schema（宿主渲染）

v1 推荐使用“组件树 + props + children”：

```json
{
  "type": "page",
  "props": { "title": "示例页" },
  "children": [
    { "type": "text", "props": { "text": "Hello" } },
    { "type": "button", "props": { "text": "点击", "event": { "name": "click" } } }
  ]
}
```

### 7.1 最小组件集（建议宿主内置）

- 布局：`page`、`column`、`row`、`list`、`grid`、`card`、`divider`、`spacer`
- 文本：`text`、`markdown`
- 图片：`image`
- 交互：`button`、`textField`、`select`、`switch`
- 状态：`loading`、`empty`、`error`

### 7.2 TV 端 Focus 约定（建议预留字段）

每个可聚焦节点可带：
- `focusId`：字符串
- `focusNext`：`{ up, down, left, right }` 指向其他 `focusId`

宿主也可按布局自动推导，但建议字段保留以便复杂页面可控。

## 8. 返回结构（建议）

### 8.1 PageRenderResult

```json
{
  "title": "页面标题（可选）",
  "state": { },
  "schema": { }
}
```

### 8.2 PageEventResult

```json
{
  "state": { },
  "actions": [
    { "type": "toast", "message": "完成" },
    { "type": "navigate", "route": "/xxx", "params": { } }
  ]
}
```

actions 由宿主实现白名单（避免插件执行任意原生能力）。

## 9. registry.json（市场索引）规范

用途：
- 网页展示（名称/描述/标签/支持端/最新版本）
- 客户端查更新（同 `pluginId` 多版本）

索引不参与安全校验；安全校验由 `manifest.json + sha256 + blocked.json` 完成。

建议字段见：`schemas/registry.schema.json`。

## 10. blocked.json（下架/禁用）规范

建议字段见：`schemas/blocked.schema.json`。

## 11. 示例

参考：`plugins/example.hello/1.0.0/manifest.json` 与 `plugins/example.hello/1.0.0/main.js`。

