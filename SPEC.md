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

说明（为什么不只“删掉插件文件”）：
- `blocked.json` 是 **kill switch**：用于紧急禁用“已安装在用户设备上”的插件或某个版本
- 仅在仓库里删除插件目录/文件，或仅从 `registry.json` 移除展示（下架），都**不能可靠阻止**已安装插件继续运行：
  - 插件脚本/资源可能已下载到本地（离线也能被加载）
  - 本规范强烈建议安装链接使用 tag/commit SHA；即使从 `main` 删除，历史版本仍可能被访问/复用
  - CDN/缓存/镜像/分叉仓库可能继续提供旧内容

治理建议：区分三种动作（可同时发生）：
- **下架（Delist）**：从 `registry.json` 移除/隐藏，阻止新用户发现与安装
- **禁用（Block）**：写入 `blocked.json`（按 `id` 或 `id+version`），阻止安装并让已安装自动停用
- **删除文件（Delete）**：可作为清理手段，但不能替代 `blocked.json`

推荐处置流程（MVP）：
1. 先在 `blocked.json` 里封禁（尽快生效）
2. 同时从 `registry.json` 下架（减少新增安装）
3. 视情况再删除插件目录/资源，并在 `blocked.json` 保留封禁记录一段时间

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
- `permissions`：权限声明（v1 仅定义 `network`；如需网络能力需显式声明）
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

- `enabled`：是否允许插件使用 `ctx.net.request()`（未声明 `permissions.network` 或 `enabled: false` 时，宿主必须拒绝该能力；建议让 `ctx.net.request()` 抛错/返回权限错误）
- `domains`：当 `enabled: true` 时必填；允许访问的域名白名单；`"*"` 表示不限制（你当前倾向）
- 宿主仍应做：超时、并发限制、最大响应大小

仅做 UI/卡片类插件（不需要网络）示例：
```json
{
  "permissions": {
    "network": { "enabled": false }
  }
}
```

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
- `slots`：向宿主内置页面注入内容（首页/详情/播放页等的插槽扩展点）
- `dataSources`：数据源（搜索/列表/详情）
- `playSources`：播放源解析（返回可播放 URL/headers/字幕等）
- `tasks`：自动化任务（触发器 + run）
- `uiComponents`：自定义 UI 组件（Schema 级）

所有 handler 都是**入口脚本中定义的全局函数名**（字符串）。宿主通过脚本引擎调用这些函数。

#### 5.5.1 pages（插件自有页面）

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

字段约定：
- `id`：页面唯一 ID（插件内唯一）
- `title`：页面标题（用于展示/入口）
- `route`：路由（建议以 `/plugin/` 开头；宿主用于注册导航入口）
- `targets`：可选；不填则默认等于 manifest 的 `targets`
- `render`：渲染函数名
- `onEvent`：可选；事件处理函数名

可选字段（仅影响“插件中心/入口列表”的展示，不影响路由能力）：
- `icon`：图标文件路径（相对插件版本目录，如 `icon.png`/`icon.svg`）；**必须加入 `files[]`** 才能被宿主下载与校验
- `order`：排序（数字越小越靠前；默认 `0`）
- `entry`：是否作为推荐入口（默认 `false`；宿主可用于置顶/高亮）

宿主入口展示约定（MVP 建议写死，避免插件作者“不知道页面在哪里出现”）：
- **TV**：宿主提供一个顶层 Tab：`插件`（与 TMDB/Bangumi 同级），列出所有已安装插件的 `pages`（按 `order` / `title` 排序），点击进入对应 `route`
- **Mobile/PC**：宿主提供一个“插件中心”页面（可放在设置里或首页入口），同样列出所有 `pages`；可优先展示 `entry: true` 的页面

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

#### 5.5.6 slots（往宿主页面“加东西”）

用途：插件向宿主内置页面（如 首页 / 详情页 / 播放页）注册**插槽贡献**，宿主在指定 `slotId` 的位置渲染插件返回的 UI Schema。

Manifest 结构：
```json
{
  "contributions": {
    "slots": [
      {
        "id": "home_banner",
        "title": "首页横幅",
        "slotId": "home.feed.beforeSections",
        "targets": ["tv", "mobile", "pc"],
        "render": "slot_home_render",
        "onEvent": "slot_home_onEvent",
        "priority": 0
      }
    ]
  }
}
```

调用约定（复用 `pages` 的返回体最省事）：
- `render(ctx, params, state)` -> `PageRenderResult`（宿主仅使用 `schema/state`，`title` 可忽略）
- `onEvent(ctx, event, state)` -> `PageEventResult`

合并/治理约定（建议写死，宿主必须实现）：
- 同一个 `slotId` 可有多个贡献；宿主按 `priority` **降序**渲染（默认 `0`）
- 宿主对每个 `slotId` 限制最多渲染 **N 个**（建议 `6` 个），其余忽略（避免占满页面/影响性能）
- 宿主必须对白名单 `actions` 做过滤（沿用 `toast` / `navigate`）；不支持的 action 直接忽略

v1 MVP SlotId（先覆盖：首页 / 详情页 / 播放页）：

**A. 首页（Home）**
- `home.feed.beforeSections`
  - 放置点：继续观看/快捷入口之后、服务器推荐分区（sections）之前
  - `params`：`{ "placement": "home" }`
  - 期望 schema：`card` / `column` / `row`（用于“插件入口卡片、活动横幅、快捷按钮”）
- `home.feed.afterSections`
  - 放置点：所有 sections 之后、页面底部（统计/版权信息等）之前或最底部
  - `params`：`{ "placement": "home" }`

**B. 详情页（Detail / ShowDetail）**
- `detail.hero.actions`
  - 放置点：播放/收藏/更多那排按钮附近
  - `params`（建议字段固定，避免宿主/插件各玩各的）：
    ```json
    {
      "placement": "detail",
      "media": {
        "id": "xxx",
        "type": "Movie|Series",
        "title": "xxx",
        "year": 2024,
        "providerIds": { "tmdb": "", "imdb": "", "trakt": "" }
      }
    }
    ```
  - 期望 schema：`row`（少量按钮/徽章）
- `detail.sections.bottom`
  - 放置点：详情页底部额外信息区（例如在“外部链接/演员/剧集信息”之后）
  - `params`：同上
  - 期望 schema：`column`（信息卡片、额外分区）

**C. 播放页（Player）**
- `player.appbar.trailing`
  - 放置点：播放器 AppBar 右侧 actions（图标按钮区）
  - `params`：
    ```json
    {
      "placement": "player",
      "playback": { "title": "", "itemId": "?", "positionMs": 123000, "durationMs": 456000 }
    }
    ```
  - 期望 schema：`row`（建议 1–3 个 `iconButton` / 按钮）
- `player.overlay.bottom`（可选但很有用）
  - 放置点：播放器控制层底部区域（不想挤 AppBar 的时候用）
  - `params`：同上
  - 期望 schema：`row` / `column`

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
- `ctx.net.request(req)`：网络请求能力（仅当 `permissions.network.enabled: true` 时可用；否则宿主应拒绝/抛错）
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
- 交互：`button`、`iconButton`、`textField`、`select`、`switch`
- 标签：`chip`、`badge`
- 状态：`loading`、`empty`、`error`

### 7.2 TV 端 Focus 约定（建议预留字段）

每个可聚焦节点可带：
- `focusId`：字符串
- `focusNext`：`{ up, down, left, right }` 指向其他 `focusId`

宿主也可按布局自动推导，但建议字段保留以便复杂页面可控。

### 7.3 slots MVP 推荐补充组件（更“原生”）

为让插件在 首页/详情/播放页 的插槽里“像原生一样”，建议宿主在 v1 内置以下两个组件（比让作者用 `button + text` 硬拼稳定很多，TV 焦点也更好处理）：

- `iconButton`：用于 `player.appbar.trailing` 这类区域  
  `props` 建议：`{ "icon": "xxx", "tooltip": "xxx?", "event": { "name": "xxx", "payload": {} } }`
- `chip` / `badge`：用于详情页/卡片的小标签  
  `props` 建议：`{ "text": "xxx", "event": { "name": "xxx", "payload": {} }? }`

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
