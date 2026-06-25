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
```

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
  fields: [{ key, label, type: 'text'|'password'|'number'|'switch', default, hint }],
  submitLabel, cancelLabel
}); // 返回 { key: value } 或 null（取消）
await ctx.ui.openPage(pageId, params);
```

### ctx.emby
```js
await ctx.emby.getServerUrl();    // 需 emby.read
await ctx.emby.getServerInfo();   // 需 emby.read -> { url, baseUrl, name, username, userId }
await ctx.emby.getCurrentUser();  // 需 emby.read -> { id, name }
await ctx.emby.getCredentials();  // 需 emby.credentials -> { username, password, url }
await ctx.emby.apiRequest({ method, path, query, body }); // 需 emby.api -> { status, body }
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
