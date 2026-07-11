# LinPlayer 插件规范 V1

LinPlayer 插件是运行在 **QuickJS** 里的 JavaScript。每个插件跑在**独立 isolate**，
通过受权限控制的全局 `ctx` 与宿主交互，并可向预定义**扩展点**挂载功能。

本规范与 App 内置加载器（`lib/plugins`）一致，是「照着写就能跑」的版本。

---

## 1. 插件结构

一个插件 = 一个目录，至少包含 `manifest.json` + 入口 `main.js`：

```
plugins/<id>/<version>/
├── manifest.json     # 必需，插件清单
├── main.js           # 必需，入口脚本
├── README.md         # 建议
└── icon.svg          # 可选，图标
```

用 `python tools/build.py` 打包成 `.ipk`（zip）后由 App「设置 → 插件 → +」安装。

---

## 2. manifest.json

```json
{
  "id": "com.example.foo",          // 必需，反向域名，唯一，至少一个点
  "version": "1.0.0",               // 必需，语义化版本
  "name": "示例插件",                // 必需
  "description": "一句话说明",        // 必需
  "author": "你的名字",              // 可选（字符串）
  "main": "main.js",                // 可选，入口，默认 main.js
  "icon": "icon.svg",               // 可选
  "homepage": "https://...",        // 可选
  "minAppVersion": "1.0.0",         // 可选
  "permissions": ["http", "storage"],          // 必需，申请的能力
  "httpAllowedHosts": ["api.example.com"],     // 可选，HTTPS 白名单
  "extends": {                                  // 可选，静态声明扩展点
    "settingsPages": [
      { "id": "settings", "title": "设置", "handler": "openSettings" }
    ]
  }
}
```

校验要点：`id`/`version` 必须与目录名一致；`permissions` 只能是已知权限；
`extends` 的键只能是已知扩展点。见 `schemas/manifest.schema.json`。

---

## 3. 权限

启用前会弹窗让用户同意。运行时每次 `ctx.*` 调用都会做权限检查，未授权抛 JS 异常。

| 权限 | 含义 |
|------|------|
| `player.read` | 读播放状态、当前媒体；监听播放事件 |
| `player.control` | 播放 / 暂停 / 跳转 |
| `http` | HTTPS 网络访问（受 `httpAllowedHosts` 白名单约束） |
| `storage` | 本地存储（每插件独立，上限 5MB） |
| `ui` | Toast / 对话框 / 表单 / 打开页面 |
| `emby.read` | 读当前用户、服务器地址/名称 |
| `emby.api` | 以当前登录身份调用 Emby 接口 |
| `emby.credentials` | 读添加服务器时填写的账号密码（用于登录配套网站） |
| `cfproxy` | Cloudflare 优选 IP 测速 + 本地反代（把服务器线路改写到本地反代） |
| `extensions` | 注册扩展点 |
| `log` | 写日志（始终允许，无需声明） |

---

## 4. ctx API

所有 `ctx.*` 调用返回 Promise（除 `ctx.log`）。

### ctx.log（始终可用）
```js
ctx.log.info(msg); ctx.log.warn(msg); ctx.log.error(msg);
```

### ctx.http（需 `http`，仅 HTTPS + 白名单）
```js
const res = await ctx.http.get(url, { headers, query });
const res = await ctx.http.post(url, body, { headers, query });
// res = { status, headers, body }
// body：响应是 JSON 时为对象/数组，否则为字符串

// discardBody：按流丢弃响应体、只统计字节数，不读进 isolate（避免大文件撑爆 64MB）。
// 用于测速这类只关心“传了多少、多快”的下载。返回 { status, headers, bytes }。
const res = await ctx.http.get(url, { headers, discardBody: true });
// res = { status, headers, bytes }
```

> **白名单是 fail-closed 的**：`httpAllowedHosts` 为空/缺省 = **拒绝所有主机**（不是放行）。
> 任何要联网的插件都必须显式列出会访问的 host（精确匹配，无通配符），否则每次请求都抛
> `域名不在白名单内`。重定向后的最终 host 也必须在白名单内。

### ctx.storage（需 `storage`，<=5MB）
```js
await ctx.storage.get(key);      // 任意 JSON 值或 undefined
await ctx.storage.set(key, val);
await ctx.storage.delete(key);
await ctx.storage.keys();        // string[]
await ctx.storage.clear();
```

### ctx.player（getCurrentMedia 需 `player.read`；play/pause/seek 需 `player.control`）
```js
const media = await ctx.player.getCurrentMedia();
// { id, name, type, seriesName, indexNumber, parentIndexNumber, overview, ... }
await ctx.player.getCacheLimitBytes(); // 需 player.read -> 用户设置的视频缓存上限(字节)
await ctx.player.play();
await ctx.player.pause();
await ctx.player.seek(seconds);
ctx.player.on('onPlayEnd', fn);   // 事件：onPlay / onPause / onPlayEnd
ctx.player.off('onPlayEnd', fn);
```

### ctx.ui（需 `ui`）
```js
ctx.ui.showToast(message);
const buttonId = await ctx.ui.showDialog({ title, message, buttons: [{ id, label }] });
const values = await ctx.ui.showForm({
  title,
  fields: [
    { key, label, type: 'text'|'password'|'number'|'switch', default, hint },
    // select：下拉选择，options 每项 { value, label }，返回选中项的 value
    { key, label, type: 'select', options: [{ value, label }], default, hint }
  ],
  submitLabel, cancelLabel
}); // 返回 { key: value } 或 null（取消）
await ctx.ui.openPage(pageId, params);

// 进度面板：可实时更新的模态框，用于测速/下载这类过程可视化。
const id = await ctx.ui.showProgress({ title, message, percent }); // percent 0-100，缺省=不定态
await ctx.ui.updateProgress(id, { message, percent });
await ctx.ui.closeProgress(id);
```

### ctx.emby
```js
await ctx.emby.getServerUrl();    // 需 emby.read
await ctx.emby.getServerInfo();   // 需 emby.read -> { url, baseUrl, name, username, userId }
await ctx.emby.getCurrentUser();  // 需 emby.read -> { id, name }
await ctx.emby.getCredentials();  // 需 emby.credentials -> { username, password, url }
await ctx.emby.apiRequest({ method, path, query, body, headers, discardBody });
// 需 emby.api -> { status, body }
//   headers     可选，自定义请求头（如 Range，用于分段预热当前流；token 仍自动注入）
//   discardBody 可选，true 时按流丢弃响应体、不读进 isolate，返回 { status, bytes }
//               （用于多线程预热缓存，避免大段二进制撑爆 64MB 内存）
```

### ctx.cfproxy（需 `cfproxy`）

Cloudflare 优选 IP 测速 + 本地反代。重活（测速/反代/定时）都在宿主完成，插件只编排。

```js
await ctx.cfproxy.listServers();   // [{id,name,host,url,active,pinnedIp,latencyMs,downloadKBps,scheduleEnabled,scheduleMinutes}]
await ctx.cfproxy.getStatus();     // { active:[{id,name,pinnedIp,latencyMs,downloadKBps,scheduleEnabled}] }
await ctx.cfproxy.openPanel();     // 打开宿主可视化面板（推荐入口，自带实时测速进度）
await ctx.cfproxy.speedTest(id);   // 对某服务器测速并应用最优 IP -> 最优结果或 null
await ctx.cfproxy.disable(id);     // 关闭某服务器反代，恢复直连
await ctx.cfproxy.setSchedule(id, true, 30); // 定时测速（分钟）
await ctx.cfproxy.restore();       // 按持久化配置恢复（通常在 onEnable）
await ctx.cfproxy.teardown();      // 拆除全部反代（通常在 onDisable）
```

### ctx.extensions（需 `extensions`）
```js
const { id } = await ctx.extensions.register(type, descriptor);
await ctx.extensions.unregister(type, id);
```

### 其它
```js
await ctx.sleep(ms);   // 延时（封顶 10s），用于重试退避
ctx.plugin;            // { id, name, version }
ctx.onEnable(fn);      // 生命周期
ctx.onDisable(fn);
```

---

## 5. 扩展点

通过 manifest 的 `extends` 静态声明，或运行时 `ctx.extensions.register(type, descriptor)`。
descriptor 里的 `handler` 是一个函数（运行时注册）或全局函数名（manifest 声明）。

| 类型 | descriptor 关键字段 | handler 返回 / 作用 |
|------|---------------------|---------------------|
| `homeStats` | `{ id, title, handler }` | 返回 `{ metrics: [{label, value}] }`，渲染在首页媒体计数旁 |
| `settingsPages` | `{ id, title, handler }` 或 `{ id, title, fields:[...] }` | handler 打开自定义 UI；或声明式表单由宿主渲染 |
| `sidebarItems` | `{ id, title, icon, route?, handler? }` | 侧边栏/导航入口 |
| `actions` | `{ id, title, icon, context, handler }` | 详情/播放器的操作按钮 |
| `contextMenus` | `{ id, title, context, handler }` | 右键/长按菜单项 |
| `playerOverlays` | `{ id, align, ... }` | 播放器覆盖层 |
| `mediaSources` | `{ id, title, handler }` | 自定义媒体来源 |
| `eventListeners` | `{ event, handler }` | 事件监听（通常直接用 `ctx.player.on`） |

**平台支持**：`homeStats`/`sidebarItems`/`actions`/`settingsPages`/`eventListeners`/`mediaSources`
三端都可注册；`playerOverlays`/`contextMenus` 在 TV 端不支持（加载时忽略并记日志）。
当前宿主已接入渲染：桌面端 `homeStats`、各端「设置 → 插件」里的 `settingsPages`。

---

## 5.5 iOS 插件（runtime: data / addon）

iOS App Store 政策(指南 2.5.2)**禁止下载并执行会改变功能的代码**，所以上面的
`runtime: js`(main.js 跑在 QuickJS)在 iOS 商店版**不能用**。iOS 专用插件必须是
下面两种"不在设备上执行下载代码"的形态。仓库校验强制：**`targets` 含 `ios` 时
`runtime` 必须为 `data` 或 `addon`**。这类插件**没有 main.js**。

### A. `runtime: data` —— 声明式数据驱动（无服务器）

插件 = 一份 `data` 声明，由 App 内置的、已过审的固定解释器执行；下载的是**数据不是代码**。
模板插值：`{serverUrl}`、`{cfg.KEY}`(用户在 `settings` 填的值)、`{media.FIELD}`(当前媒体)、
以及多步里 `capture` 的变量。响应取值用点路径 `path`（如 `data.limit_bytes`）。

支持的块：
| 块 | 作用 |
|----|------|
| `settings[]` | 用户可填配置，值以 `{cfg.KEY}` 引用 |
| `homeStats` | `when` 门槛 + `request` **或** `steps[]`(多步,`capture` 捕获响应字段) + `metrics[]`，首页显示指标 |
| `onEvent[]` | 播放事件(`onPlay/onPause/onPlayEnd`)触发一个 `request`（如播完发通知）|
| `mediaSource` | `catalog`/`search`：`request` + `list`(列表点路径) + `map`(字段映射) |

`request`：`{ method, url(HTTPS,可模板), auth: none|emby, headers, query, json }`。
`steps[]`：`[{ request, capture:{变量名: 响应点路径} }, ...]` 按序执行，后一步可用前一步捕获的 `{变量}`。
`metrics[].value`：声明式变换 `{ var|subtract|add|path, divide, multiply, round, suffix }`（非公式解析器，仍是配置）。

示例：
- `plugins/com.linplayer.telegram-notify-ios/`（onPlayEnd → 发 Telegram）
- `plugins/com.linplayer.uhdnow-traffic-ios/`（**多步**：登录换 token → 拉流量 → 算剩余，纯 data，无服务器）

**能力边界**：data 已能表达"多步请求 + 捕获 + 简单计算"，绝大多数"取数/展示/通知/源解析"够用。
真正需要 addon 的只剩**只能在服务端做**的：藏一个不能进客户端的秘密 API key、服务端聚合/抓取多源、重计算。**普通的"用用户账密登录后取数"应留在 data（如 uhdnow-traffic-ios），不必上服务器。**

### B. `runtime: addon` —— 远程 addon 服务（Stremio/Forward 模型）

插件逻辑跑在**远程 HTTP 服务**上（服务端可复用你现有的 JS），App 只按固定协议收发 JSON。
设备上没有下载/执行任何代码，App Store 合规。manifest 只声明：

```json
"runtime": "addon",
"addon": { "baseUrl": "https://your-addon.example.com", "resources": ["homeStats","catalog","meta","stream"] }
```

App 调用协议（v1）：
```
GET  {baseUrl}/manifest.json          -> { id, name, resources: [...] }
GET  {baseUrl}/homeStats?serverUrl=.. -> { metrics: [ { label, value } ] }
GET  {baseUrl}/catalog?query=..       -> { items:   [ { id, title, poster? } ] }
GET  {baseUrl}/meta?id=..             -> { item:    { id, title, overview?, ... } }
GET  {baseUrl}/stream?id=..           -> { streams: [ { url, title?, headers? } ] }
```
逻辑全在服务端；你负责托管。当前仓库无内置 addon 示例（uhdnow 流量这类"账密登录取数"
已用 data 在设备上完成，见上）。addon 机制保留，供真正只能服务端做的插件使用。

> 选型：**默认用 A（data）**——零服务器、离线可用、够表达多步+计算。仅当逻辑必须藏在服务端
> （秘密 key / 服务端聚合抓取 / 重计算）才用 B（addon）。

---

## 6. 生命周期

`main.js` 顶层代码在加载时执行（可在此 `ctx.player.on`、`ctx.extensions.register`）。
另可注册：
```js
ctx.onEnable(async () => { /* 启用后 */ });
ctx.onDisable(() => { /* 禁用前 */ });
```

---

## 7. 安全与限制

- **隔离**：每插件一个 QuickJS isolate，内存上限 64MB；崩溃/死循环只影响自己，不拖垮 App。
- **超时**：单次进入 JS 的墙钟上限 30s，超时视为失控并自动禁用插件。
- **网络**：默认仅 HTTPS；`httpAllowedHosts` 非空时进一步限制 host。
- **无文件系统**：不暴露 fs，禁止 `import` 外部模块。
- **存储**：每插件独立，上限 5MB。

---

## 8. 打包与安装

`.ipk` 就是包含 `manifest.json` + `main.js`(+图标) 的 zip：

```bash
python tools/build.py     # 一键：校验 + 生成 registry + 打包所有插件
# 产物 packages/<id>-<version>.ipk
# 单个打包：python tools/pack_plugin.py plugins/<id>/<version>/
```

安装：App「设置 → 插件 → +」选择 `.ipk`（兼容旧 `.lpk`）→ 同意权限 → 启用。

---

## 9. 示例

- `plugins/com.linplayer.hello/1.0.0/` —— 最小教程，照抄起步
- `plugins/com.linplayer.telegram-notify/1.0.0/` —— 监听 onPlayEnd + http + 设置表单
- `plugins/com.linplayer.uhdnow-traffic/1.0.0/` —— emby 检测 + 账密登录 + homeStats

只看一个就看 `com.linplayer.hello`。
