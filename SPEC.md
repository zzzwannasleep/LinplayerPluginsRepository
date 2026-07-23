# LinPlayer 插件规范 v2

`apiVersion: 2`。**和 v1 不兼容**，没有兼容层：v1 插件装不上，会明确告诉用户去拿新版。

上手请先看[开发指南](guide.html)，这里是逐项参考。

## 插件长什么样

一个插件是一个目录，打成 zip 后改名 `.ipk`：

```
manifest.json      必须在包根，不能多包一层目录
main.js            入口（manifest.main 可以改名）
icon.svg           可选，svg 或 png，≤64KB
README.md          可选
view/…             可选，沙箱视图用的网页
```

宿主安装时解压到 `<数据目录>/plugins/<插件id>/`，一个插件一个版本，重装即覆盖。

代码跑在一个受限的 JS 引擎里（QuickJS），**没有** `window`、`document`、`fetch`、
`XMLHttpRequest`、`require`、`import`。能用的只有标准 JS 内置对象加一个全局 `ctx`。

## manifest.json

### 必填

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 反向域名，至少两段，只能用字母数字和 `-` `_`。**必须和目录名一致**。 |
| `version` | string | 语义化版本 `x.y.z`。**必须和版本目录名一致**。 |
| `apiVersion` | number | 必须是 `2`。缺省会被当成 v1 直接拒绝。 |
| `name` | string | 展示名。 |
| `description` | string | 一句话说明干什么。市场卡片直接显示它。 |

### 选填

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `author` | **string** | `未知作者` | 必须是字符串。v1 的 `{"name": …}` 对象形式会让宿主**整条跳过**。 |
| `category` | string | `tools` | `source` / `ui` / `player` / `notify` / `tools`。 |
| `targets` | string[] | 不限 | `pc` / `mobile` / `tv`。**没有 `ios`**。 |
| `main` | string | `main.js` | 入口 JS，相对插件目录。 |
| `icon` | string | — | 图标文件名。构建时会内联成 data URI 进索引。 |
| `homepage` | string | — | 主页链接。 |
| `license` | string | — | 许可证。 |
| `minAppVersion` | string | — | 要求的最低 LinPlayer 版本。 |
| `tags` | string[] | `[]` | 搜索用的标签。 |
| `permissions` | string[] | `[]` | 见下。 |
| `httpAllowedHosts` | string[] | `[]` | 见下。**空 = 完全不能出网**。 |
| `contributes` | object | `{}` | 见下。 |

### 撞上就整包被拒的字段

| 字段 | 为什么没了 |
|---|---|
| `runtime` | v1 的 `data` / `addon` 是 iOS 上架合规专用，苹果全线已经不做。 |
| `extends` | 八个平级扩展点改成了四类 × slot，见 `contributes`。 |
| `data` / `addon` | 同 `runtime`。 |
| `channel` | 不再有 stable/beta 通道。 |
| `minHostVersion` | 改名为 `minAppVersion`。 |

## 权限

在 `permissions` 里声明，用户在**启用前**会逐条看到人话说明。没声明就调对应的
`ctx.*`，直接抛异常。`log` 隐式授予，不用写。

| id | 用户看到的 | 敏感 |
|---|---|:--:|
| `player.read` | 读取播放状态 | |
| `player.control` | 控制播放器 | ⚠ |
| `http` | 网络访问 | ⚠ |
| `storage` | 本地存储 | |
| `ui` | 界面交互 | |
| `emby.read` | 读取 Emby 信息 | |
| `emby.api` | 调用 Emby 接口 | ⚠ |
| `sources` | 提供数据源 | ⚠ |
| `extensions` | 扩展界面 | |
| `sandbox` | 自定义界面 | ⚠ |

### 已删除

| id | 替代做法 |
|---|---|
| `emby.credentials` | 宿主不再持久化明文密码。插件要账密就自己弹表单，存进自己的 `ctx.storage`（每插件隔离）。 |
| `cfproxy` | CF 优选反代已改为应用内置功能。 |

## 出网白名单

`httpAllowedHosts` 是 **fail-closed** 的：空数组或不写 = 拒绝一切出网，不是放行。

| 写法 | 含义 |
|---|---|
| `api.example.com` | 精确匹配这个主机。 |
| `*.example.com` | 子域通配。**不覆盖主域本身**。 |
| `*` | **无效**。它谁都匹配不上（能匹配上就等于一个字符击穿整道边界）。 |
| `$sourceServer` | 运行时展开成用户在「添加服务器」里亲手填的那个地址的 origin。 |

`$` 开头但拼错的令牌会在装包时直接报错，不会被当成一个永远匹配不上的普通域名
静默放过 —— 那样作者会对着「域名不在白名单内」查半天域名。

**协议**：一律只允许 https。唯一例外是 `$sourceServer` —— 用户自己填的地址如果是
`http://`，那个 origin 就放行明文（自建 OpenList / 飞牛之类绝大多数是局域网 http，
强制 https 等于开箱即拒）。

重定向后的最终地址会**再过一遍**同一道准入，所以 302 跳到白名单外主机同样会被拦。

## 贡献点 contributes

把能力挂到宿主的预定义位置。形如：

```jsonc
"contributes": {
  "panels": [ { "id": "…", "slot": "…", "handler": "…" } ]
}
```

每一类都**硬绑**一个权限，没声明对应权限的话 manifest 校验直接拒（否则用户在授权
弹窗里看不到，却被悄悄挂上了东西）：

| 类型 | 要的权限 | 是什么 |
|---|---|---|
| `dataSources` | `sources` | 一个完整数据源：浏览 / 搜索 / 播放。 |
| `panels` | `extensions` | 一块界面，挂在 `slot` 指定的位置。 |
| `actions` | `extensions` | 一个操作项，出现在 `context` 指定的上下文。 |
| `sandboxViews` | `sandbox` | 一个 iframe 逃生舱视图。 |

### panels

| 字段 | 说明 |
|---|---|
| `id` | 必填，非空。 |
| `slot` | 必填，见下表。 |
| `title` | 显示的标题。 |
| `handler` | 全局函数名，返回界面描述树。 |
| 其它任意键 | 值是全局函数名，供描述树里的 `handler` 引用（按钮、列表项）。 |

| slot | 落在哪 |
|---|---|
| `home.stats` | 首页统计区。 |
| `settings` | 这个插件详情页里的「设置」标签。 |
| `sidebar` | 侧栏一个独立入口，点开是整页。 |
| `page` | 整页。入口在插件详情页的「打开」。 |
| `player.overlay` | 播放器叠加层。 |

### actions

`context` 缺省 `global`，可选 `global` / `item` / `player`。

### sandboxViews

| 字段 | 说明 |
|---|---|
| `id` | 必填。 |
| `entry` | 必填，插件目录内的 html 相对路径。不许 `..`，不许绝对路径。 |
| `title` | 显示的标题。 |

沙箱视图跑在**独立 origin 的 iframe** 里，拿不到 `ctx`，也拿不到 App 的任何接口。
这不是限制没做完，是它被允许存在的前提：主窗口的 JS 上下文里有宿主的 invoke 通道，
插件代码一旦同源，整套权限模型就作废了。

iframe 的 sandbox 属性是 `allow-scripts allow-forms allow-popups` —— 没有
`allow-same-origin`（给了就等于取消隔离），也没有 `allow-top-navigation`。

### dataSources

| 字段 | 说明 |
|---|---|
| `id` | 必填。数据源在宿主里的键是 `plugin:<插件id>/<这个 id>`。 |
| `name` | 展示名。「添加服务器」页上显示它。 |
| `auth.fields[]` | 登录表单。宿主按这个描述渲染，你不用自己画。每项要有 `id`。 |

`auth.fields[].id` 有三个是宿主认得的：`base_url`（也是 `$sourceServer` 的来源）、
`username`、`password`。其余的会打包成 JSON 塞进 `server.token` 原样透给插件。

**manifest 里写描述，运行时补行为。** 两边同 id 的贡献会**合并**（运行时的键赢，
manifest 的键填空缺），所以 `ctx.sources.register` 只交三个回调不会把 `name` 和
`auth` 冲掉。

## ctx API

全局对象 `ctx`。括号里是需要的权限。

### ctx.log（无需声明）

```js
ctx.log.info(msg)  ctx.log.warn(msg)  ctx.log.error(msg)
```

### ctx.http（`http`）

```js
await ctx.http.get(url, opts)
await ctx.http.post(url, body, opts)
await ctx.http.delete(url, opts)
```

`opts`：`{ headers, query, body, discardBody }`。
返回 `{ status, headers, body }`；`body` 是 JSON 就已经解析成对象，否则是字符串。

`discardBody: true` 时按流丢弃只统计字节数，返回 `{ status, headers, bytes }`，
内存恒定 —— 测速、探测大小用它，别把上百 MB 读成一个字符串。

> **必须自己设 `User-Agent`。** 宿主的 http 客户端默认一个头都不发，
> 很多站（尤其挂 CF 的）会直接 403，而报错看起来像是鉴权失败。

### ctx.storage（`storage`）

```js
await ctx.storage.get(key)      await ctx.storage.set(key, value)
await ctx.storage.delete(key)   await ctx.storage.keys()
```

每个插件独立，别的插件读不到。上限 5MB。

### ctx.ui（`ui`）

```js
ctx.ui.showToast(text)
await ctx.ui.showDialog({ title, message, confirmLabel, cancelLabel })  // -> true/false/null
await ctx.ui.showForm({ title, description, fields, submitLabel })      // -> {id: value} / null
await ctx.ui.showList({ title, items })                                 // -> 选中项的 id / null
await ctx.ui.showProgress({ title });  ctx.ui.updateProgress({ value }); ctx.ui.closeProgress()
ctx.ui.render(viewId, tree)     // 主动把新树推给某块面板
```

`showForm` 的 `fields[]`：`{ id, label, type, value, placeholder, options }`。
`type` 可以是 `text` / `password` / `textarea` / `select` / `switch`。

> 键是 **`id`** 和 **`value`**，不是 `key` / `default`。没有 `id` 的控件会被整个
> 丢掉，表现是表单一片空白且没有任何报错。

用户取消或直接关窗时返回 `null`，一定要判。

`ctx.ui.openPage` 目前不支持，会提示用户。

### ctx.player（`player.read` / `player.control`）

```js
await ctx.player.getCurrentMedia()      // player.read
await ctx.player.getCacheLimitBytes()   // player.read
ctx.player.on(event, fn)                // player.read
ctx.player.off(event)
await ctx.player.play() / pause() / seek(secs)   // player.control
```

事件：`onPlay`、`onPlayEnd`。

> `off(event)` 是按事件整体清空的，不做函数身份匹配。

### ctx.emby（`emby.read` / `emby.api`）

```js
await ctx.emby.getServerUrl()      await ctx.emby.getServerInfo()
await ctx.emby.getCurrentUser()    await ctx.emby.apiRequest(...)   // emby.api
```

没有 `getCredentials` —— 见「已删除的权限」。

### ctx.extensions（按贡献点类型各自校验权限）

```js
await ctx.extensions.register(kind, descriptor)   // 两个参数！descriptor 必须是带 id 的对象
await ctx.extensions.unregister(kind, id)
```

`kind` 是 `panels` / `actions` / `sandboxViews` / `dataSources` 之一。

> 参数数量写错（比如照 `ctx.sources.register` 的形状写成三个）会直接抛异常，
> 不会静默注册出一条谁也用不上的幽灵贡献。

### ctx.sources（`sources`）

```js
await ctx.sources.register(srcId, { listDir, search, resolvePlay })
await ctx.sources.unregister(srcId)
```

### 其它

```js
ctx.util.isVideoName(name)     // 用宿主那份扩展名表判断，别自己维护一份
ctx.errors.unsupported(msg)    // throw 它表示「本源没这个能力」，UI 会退回本地过滤
await ctx.sleep(ms)            // 封顶 10 秒
ctx.plugin                     // 当前插件的元信息
ctx.onEnable(fn) / ctx.onDisable(fn)
```

## 数据源的三个函数

```js
async listDir(dirId, server)                 // dirId 为 null = 根目录
async search(query, server)
async resolvePlay(entry, qualityId, server)
```

`server` = `{ id, baseUrl, username, password, token, extra }`。这是一份显式白名单，
不是把宿主的内部结构整包丢过来。

**条目**（`listDir` / `search` 返回的数组元素）：

| 字段 | 说明 |
|---|---|
| `id` | 必填。缺 `id` 的单条会被跳过，不会炸掉整页。 |
| `name` | 显示名，不填用 `id`。 |
| `isDir` | 是不是目录。 |
| `isVideo` | 不填就按宿主的扩展名表自动判。**没有扩展名的直链必须显式写 `true`**，否则不给播。 |
| `size` / `thumb` | 大小、缩略图。 |
| `raw` | 你自己的任意数据，会原样带回 `resolvePlay`。 |

**`resolvePlay` 的返回**：

| 字段 | 说明 |
|---|---|
| `url` | **必填**。没有它直接报错（放过去的话表现是「点了没反应」，比报错难查）。 |
| `title` | 不填用条目名。 |
| `httpHeaders` / `userAgent` | 逐流的请求头。 |
| `subtitles[]` | `{ url, title, language, httpHeaders }`。 |
| `qualities[]` / `quality` | `{ id, label, rank }` 和当前选中的 id。 |

整体不是数组会报错；`search` 返回 `null` 等同于「不支持」。

## 界面描述树

插件不写 HTML，交一棵 JSON 树，宿主用自己的组件画。

**上限**：树深 12 层、总节点 400 个、每层子节点 100 个。超了**截断**，不报错。

| `t` | 字段 |
|---|---|
| `text` | `text`，`variant`: `title`/`body`/`hint`/`mono` |
| `row` | `children[]`，`wrap` |
| `col` | `children[]` |
| `divider` | — |
| `badge` | `text`，`tone`: `info`/`good`/`warn`/`danger` |
| `stat` | `label`、`value`、`hint` |
| `progress` | `value`（0~1 的小数，不是百分数）、`label` |
| `image` | **`src`**、`alt`、`height` |
| `link` | `text`、**`url`** |
| `button` | `label`、`handler`、`variant`: `primary`/`normal`/`danger` |
| `input` | **`id`**、`label`、`placeholder`、`value`、`password`、`multiline` |
| `select` | **`id`**、`label`、`value`、`options[{value,label}]` |
| `switch` | **`id`**、`label`、`value` |
| `list` | `items[{id,title,subtitle,handler}]` |

**URL 协议白名单**：图片只认 `https://`、`data:image/`、`lpplugin://`；
链接只认 `https://`、`http://`。别的一律丢掉。

`lpplugin://<插件id>/<路径>` 指插件目录里的文件。

**handler 怎么解析**：描述树里 `handler: "save"` 会去找**这条贡献点描述上**名为
`save` 的字段，取到的字符串当全局函数名调用。所以 manifest 声明的面板要用额外
handler，得在那条 panel 上登记：

```jsonc
{ "id": "cfg", "slot": "settings", "handler": "render", "save": "onSave" }
```

按钮被点时，宿主把界面上所有输入控件的当前值打成一个对象传进去，键就是控件的 `id`；
列表项还会额外带一个 `itemId`。

返回 `null` 的话宿主会自己重新调一次 `handler` 刷新界面 —— 大多数 handler 只是干件事，
不必手工拼一棵完整的树回来。

**返回一个渲染器不认识的形状**（比如 v1 的 `{metrics:[…]}`，没有 `t` 字段）时，
界面上会直接说「这个插件返回的界面描述看不懂」，而不是画一片空白。

## 索引 registry.json

由 `tools/build.py` 从各插件的 manifest 生成，**不要手写**。

```jsonc
{
  "schemaVersion": 2,
  "plugins": [{
    "id", "name", "description",
    "author",        // 字符串
    "category", "tags": [], "targets": [],
    "permissions": [],   // 摘要上移到索引：市场不下载包就能把权限列给用户看
    "contributes": {},
    "icon": "data:image/svg+xml;base64,…",   // 构建期内联，零额外请求、永不碎图
    "versions": [{
      "version", "api_version", "min_app_version",
      "package_url", "sha256", "changelog"
    }]
  }]
}
```

> **版本条目的键是 snake_case。** 写成 `packageUrl` 这种驼峰会被反序列化**静默忽略**，
> 后果是整条插件被跳过、市场里干脆看不到它，而两边都不报错。

宿主自己按版本号取最大，**不信数组顺序**。

`schemaVersion` 和 `updatedAt` 宿主不读。索引里也**没有**发布时间字段 ——
详见 `tools/build.py` 里的说明。

## 分发与完整性

registry.json 和 .ipk 都走 **GitHub raw**。不要「优化」到 Cloudflare：
国内有地方会阻断 CF，GitHub 反而更稳。

包只做 **sha256 校验和**，不做代码签名。校验和保证你拿到的和仓库里的是同一份，
**不代表内容被审计过**。

打包是可复现的（时间戳、顺序、权限位全部钉死），所以同样的源码永远算出同样的哈希。

## 目前的限制

诚实起见列在这里：

- 插件**只在电脑端可用**。安卓和电视端还没接插件命令，所以官方插件的 `targets`
  都只写 `pc`。
- `ctx.http` 没有流式进度回调，只有「整个下完」和「按流丢弃只数字节」两种。
- 沙箱视图和 `main.js` 之间没有消息通道，要传数据只能经由 `ctx.storage` 各自读写。
- `ctx.ui.openPage` 未实现。
