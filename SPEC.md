# LinPlayer 插件规范（V1，阅读版）

> 本文是面向插件作者的阅读版规范，重点回答两个问题：
> 1. V1 插件到底应该怎么做
> 2. `manifest.json` 和 `main.js` 分别负责什么
>
> 更细的草案与设计讨论见 `PLUGIN_SPEC_V1.md`。

## 1. 先理解 V1 插件是什么

LinPlayer 的 V1 插件不是“往 App 里塞一个网页”，也不是“直接注入原生控件”。

V1 的核心模型只有一句话：

**插件返回结构化数据和结构化 UI，宿主负责渲染、导航、Toast、打开链接和网络能力。**

这意味着：

- 插件作者主要写 `manifest.json` 和 `main.js`
- `main.js` 里写的是 render / onEvent 函数
- 页面长什么样，不是你直接画 Flutter，而是返回一棵 UI Schema
- 插件如果要请求网络，不是自己直接起 socket，而是调用 `ctx.net.request()`

当前阅读版规范优先描述 `pc` 和 `mobile` 两端。

- `tv` 相关字段仍然保留在 schema 和示例里
- 但它不是本文重点，也不是当前推荐的 V1 开发主线

另外，仓库里的 schema 仍保留了 `dataSources`、`playSources`、`tasks`、`uiComponents` 等扩展字段。

- 这些字段可以视为预留能力
- 当前推荐你只使用 `pages` 和 `slots`
- 如果你要做社区插件，优先走这条主路径

## 2. V1 插件能做什么，不能做什么

### 2.1 可以做什么

V1 推荐两类能力：

- 提供一个或多个插件页面
- 在宿主预留的插槽位置插入卡片、按钮或摘要信息

典型场景：

- 做一个资讯页、导航页、工具页
- 在首页插入一张推荐卡片
- 在详情页操作区加一个按钮
- 在播放器右上角加一个轻量工具按钮

### 2.2 当前不要做什么

下面这些能力不属于当前主线 V1：

- 直接注入任意 Flutter Widget
- 直接注入原生平台控件
- 以完整 WebView 作为主要展示方式
- 后台常驻任务
- 接管宿主首页
- 改写宿主数据库
- 复杂播放源解析链路

如果你的需求本质上是“抓一个网页，然后原样塞进 App”，那不是当前规范鼓励的方向。

推荐做法是：

1. 请求远程数据
2. 解析和标准化数据
3. 返回宿主可渲染的卡片、列表、按钮和文本

补充说明：

- V1 可以允许受控 `webview` 节点
- 但它只能作为页面里的辅助展示块，不能替代页面主结构
- 也不能把整个插件页面做成远端站点的完整壳

## 3. 做一个插件的最短路径

如果你只是想尽快做出第一个插件，按下面顺序做就够了：

1. 新建目录 `plugins/<pluginId>/<version>/`
2. 写 `manifest.json`
3. 写 `main.js`
4. 在 `contributions.pages` 里注册页面
5. 如果要往宿主页面加入口，再写 `contributions.slots`
6. 运行 `tools/update_manifest_files.py` 更新 `files[].size` 和 `files[].sha256`
7. 如果你希望它出现在市场页，再更新 `registry.json`

仓库里已经放了一个教程型示例：

- `plugins/example.quickstart/1.0.0/`

如果你还想看一个只聚焦网络请求的例子，可以再看：

- `plugins/example.hello/1.0.0/`

## 4. 目录结构

一个最小插件目录长这样：

```text
plugins/<pluginId>/<version>/
  manifest.json
  main.js
  icon.svg
  README.md
```

最小必需文件：

- `manifest.json`
- `main.js`

推荐附加文件：

- `icon.svg` 或 `icon.png`
- `README.md`

建议：

- `pluginId` 保持长期稳定，不要跟着版本变化
- `version` 使用 SemVer，例如 `1.0.0`
- 一个版本一个目录，不要覆盖旧版本文件

## 5. `manifest.json` 怎么写

### 5.1 你可以先照着这个最小示例写

```json
{
  "schemaVersion": 1,
  "id": "example.quickstart",
  "name": "Quickstart Plugin",
  "description": "教程型示例：最小页面 + 插槽 + 事件交互",
  "version": "1.0.0",
  "apiVersion": 1,
  "minHostVersion": "1.0.0",
  "author": {
    "name": "Example"
  },
  "targets": ["pc", "mobile"],
  "entry": {
    "pc": { "script": "main.js" },
    "mobile": { "script": "main.js" }
  },
  "permissions": {
    "network": { "enabled": false }
  },
  "files": [
    {
      "path": "icon.svg",
      "size": 123,
      "sha256": "..."
    },
    {
      "path": "main.js",
      "size": 456,
      "sha256": "..."
    }
  ],
  "contributions": {
    "pages": [
      {
        "id": "home",
        "title": "Quickstart",
        "route": "/plugin/example.quickstart/home",
        "targets": ["pc", "mobile"],
        "render": "page_home_render",
        "onEvent": "page_home_onEvent",
        "icon": "icon.svg",
        "order": 0,
        "entry": true
      }
    ],
    "slots": [
      {
        "id": "quickstart_home",
        "title": "Quickstart Home Card",
        "slotId": "home.feed.beforeSections",
        "targets": ["pc", "mobile"],
        "render": "slot_home_render",
        "onEvent": "slot_home_onEvent",
        "priority": 0
      }
    ]
  }
}
```

### 5.2 先记住这些顶层字段

必填字段：

- `schemaVersion`：当前固定为 `1`
- `id`：插件唯一 ID，建议只用字母、数字、`.`、`-`、`_`
- `name`：展示名称
- `description`：一句话说明插件干什么
- `version`：插件版本，使用 SemVer
- `apiVersion`：当前固定为 `1`
- `minHostVersion`：插件要求的最低宿主版本
- `targets`：支持哪些端，例如 `["pc", "mobile"]`
- `entry`：各端入口脚本
- `permissions`：权限声明，当前最重要的是 `network`
- `files`：需要下载和校验的文件列表

常用可选字段：

- `author`
- `license`
- `tags`
- `homepage`
- `contributions`

### 5.3 `entry`、`files` 和真实文件必须对得上

规则很简单：

- `targets` 里声明了哪个端，`entry` 里就要有哪个端
- `entry.pc.script` / `entry.mobile.script` 指向的文件，必须存在
- 这些入口文件也必须出现在 `files[]` 里
- 图标如果写在 `pages[].icon` 里，也必须出现在 `files[]` 里

`files[]` 不需要你手算哈希，直接用工具生成：

```powershell
python tools/update_manifest_files.py plugins/example.quickstart/1.0.0 --scan
```

### 5.4 `permissions` 先从最小权限开始

如果你的插件不需要网络：

```json
{
  "permissions": {
    "network": { "enabled": false }
  }
}
```

如果需要网络：

```json
{
  "permissions": {
    "network": {
      "enabled": true,
      "domains": ["example.com", "api.example.com"]
    }
  }
}
```

建议：

- 只申请真的需要访问的域名
- 不要默认写 `"*"`
- 网络失败必须有降级处理，不要白屏
- 这些域名白名单也会用于插件 `webview` 的 `src` 和顶层导航校验

## 6. `main.js` 怎么写

V1 插件最重要的就是几类 handler。

### 6.1 页面 handler

```js
function page_home_render(ctx, params = {}, state = {}) {
  return {
    title: "My Page",
    state,
    schema: {
      type: "page",
      children: []
    }
  };
}

function page_home_onEvent(ctx, event = {}, state = {}) {
  return {
    state,
    actions: []
  };
}
```

可以这样理解：

- `render()` 决定“页面现在长什么样”
- `onEvent()` 决定“点了按钮以后做什么”

### 6.2 插槽 handler

```js
function slot_home_render(ctx, params = {}, state = {}) {
  return {
    state,
    schema: {
      type: "card",
      children: [{ type: "text", props: { text: "Hello" } }]
    }
  };
}

function slot_home_onEvent(ctx, event = {}, state = {}) {
  return { state };
}
```

插槽和页面几乎一样，区别只是：

- 页面通常返回 `type: "page"` 作为根节点
- 插槽通常返回一块可嵌入的 `card`、`row` 或 `column`

### 6.3 `ctx` 里一般会有什么

当前推荐你假设 `ctx` 至少会提供这些能力：

- `ctx.target`
- `ctx.locale`
- `ctx.timeZone`
- `ctx.hostVersion`
- `ctx.plugin`
- `ctx.settings`
- `ctx.net.request(req)`
- `ctx.storage.get(key)`
- `ctx.storage.set(key, value)`
- `ctx.storage.remove(key)`
- `ctx.log(level, message, extra?)`

插件代码要自己做空值判断，不要假设每个字段一定存在。

### 6.4 `state` 该怎么用

`state` 是页面或插槽自己的本地状态快照。

适合放进 `state` 的内容：

- 当前页码
- 当前筛选条件
- 最近一次请求状态
- 当前 tab
- 当前计数器

不适合放进 `state` 的内容：

- 长期持久化数据
- 体积很大的 HTML 原文
- 无限增长的日志

需要长期保存的数据，用 `ctx.storage`。

## 7. 页面插件怎么设计

### 7.1 页面路由规则

推荐页面路由统一写成：

```text
/plugin/<pluginId>/<pageId>
```

例如：

```text
/plugin/example.quickstart/home
```

这样好处是：

- 一眼能看出属于哪个插件
- 不容易和宿主内部路由冲突
- 跳转时更稳定

### 7.2 页面入口怎么声明

页面入口写在 `contributions.pages[]` 里。

关键字段：

- `id`：页面在插件内的唯一 ID
- `title`：展示名称
- `route`：路由
- `render`：渲染函数名
- `onEvent`：事件函数名
- `entry`：是否作为推荐入口
- `icon`：页面图标
- `order`：排序

### 7.3 页面至少要考虑三种状态

每个正式插件页面都应该能表达：

- loading
- empty
- error

不要只写成功路径。

一个成熟插件的常见流程是：

1. 首次进入先显示 loading
2. 请求成功但无数据时显示 empty
3. 请求失败时显示 error
4. 如果有缓存，可优先展示缓存并提示“上次更新于”

## 8. 插槽插件怎么设计

### 8.1 当前主线 V1 统一 slotId

- `home.feed.beforeSections`
- `home.feed.afterSections`
- `detail.hero.actions`
- `detail.sections.bottom`
- `player.appbar.trailing`

### 8.2 不同 slot 适合放什么

- `home.feed.beforeSections`：入口卡片、摘要卡片、活动卡片
- `home.feed.afterSections`：补充信息、说明、扩展内容
- `detail.hero.actions`：1 到 3 个轻量按钮
- `detail.sections.bottom`：扩展信息卡片
- `player.appbar.trailing`：1 到 3 个小按钮

不要把大块内容硬塞进播放器顶部，也不要把详情页操作区做成半个页面。

### 8.3 宿主常见传参

首页：

```json
{
  "page": "home"
}
```

详情页：

```json
{
  "page": "detail",
  "media": {
    "id": "123",
    "type": "Movie",
    "title": "Example",
    "year": 2025
  }
}
```

播放器：

```json
{
  "page": "player",
  "playback": {
    "itemId": "123",
    "title": "Example",
    "positionMs": 1000,
    "durationMs": 10000
  }
}
```

插件侧必须自己做判空，不要假设 `media.title`、`playback.positionMs` 一定存在。

## 9. UI Schema 怎么理解

宿主渲染的不是 HTML，而是一棵结构化节点树。

一个最小节点通常像这样：

```json
{
  "type": "text",
  "props": {
    "text": "Hello"
  }
}
```

带交互的节点通常会把事件写在 `props.event` 里：

```json
{
  "type": "button",
  "props": {
    "text": "打开",
    "event": {
      "name": "open_page",
      "payload": {
        "id": "123"
      }
    }
  }
}
```

### 9.1 当前推荐的常用节点

布局节点：

- `page`
- `section`
- `row`
- `column`
- `list`
- `grid`
- `card`
- `divider`
- `spacer`

内容节点：

- `text`
- `markdown`
- `image`
- `webview`
- `badge`

交互节点：

- `button`
- `iconButton`
- `chip`

状态节点：

- `loading`
- `empty`
- `error`

### 9.2 `webview` 什么时候可以用

只有在下面这类场景里，才建议你使用 `webview`：

- 远端内容本身必须保留原始网页交互
- 这部分内容只是页面中的一个辅助块
- 你已经确认很难用普通 `text` / `image` / `button` / `card` 表达

不要这样用：

- 把整个首页或唯一页面做成整页 WebView
- 把一个资讯站、论坛页、后台页整站塞进宿主
- 依赖网页里的脚本直接调用宿主私有能力
- 在核心 slot 里放一大块可滚动网页

最小示例：

```json
{
  "type": "webview",
  "props": {
    "src": "https://example.com/embed/help",
    "height": 420,
    "title": "帮助页",
    "allowExternalNavigation": false,
    "showProgress": true
  }
}
```

字段说明：

- `src`：必填，必须是绝对 `http/https` URL
- `height`：必填，建议给明确高度，不要依赖自动撑开
- `title`：可选，给加载失败态和无障碍描述用
- `allowExternalNavigation`：可选，默认 `false`
- `showProgress`：可选，默认 `true`

你需要记住这些约束：

- `webview` 只建议放在 `page` 里，不要放到 `slot`
- `src` 的域名必须包含在 `permissions.network.domains` 里
- 后续顶层跳转也会继续受这个白名单限制
- 超出白名单的跳转，宿主可能拦截，也可能转成外部浏览器打开
- `webview` 页面拿不到 `ctx`
- 不要指望在网页里直接调用插件 handler 或宿主 bridge

推荐做法：

1. 能结构化展示的内容，优先结构化展示
2. 只有必须保留网页交互的部分，再单独放一个 `webview` 块
3. 给 `webview` 外面包一层普通 `section` 或 `card`
4. 对加载失败和外链跳转准备明确提示

### 9.3 当前推荐的 Action

V1 建议只用这三类：

- `toast`
- `navigate`
- `openUrl`

示例：

```js
{ type: "toast", message: "加载成功" }
```

```js
{
  type: "navigate",
  route: "/plugin/example.quickstart/home",
  params: {}
}
```

```js
{
  type: "openUrl",
  url: "https://example.com"
}
```

## 10. 网络、缓存和存储

### 10.1 网络请求建议

如果你声明了网络权限，推荐这样请求：

```js
const res = await ctx.net.request({
  url: "https://example.com/api/list",
  method: "GET",
  headers: {
    "User-Agent": "example.quickstart/1.0.0",
    "Accept": "application/json"
  },
  timeoutMs: 15000,
  responseType: "json"
});
```

建议你始终这样写：

- 请求逻辑单独封装
- 每次请求都做 `try/catch`
- 对远程返回结构做校验
- 对空结果和接口变更做降级

### 10.2 缓存建议

短期缓存和持久化建议放进 `ctx.storage`：

```js
await ctx.storage.set("cache:list", data);
await ctx.storage.set("cache:updatedAt", Date.now());
```

常见策略：

1. 页面先读缓存
2. 缓存可用时先展示旧数据
3. 再异步刷新
4. 刷新失败时保留旧数据，并给出错误提示

## 11. 发布前你至少检查这些

### 11.1 版本和命名

- `id` 和目录名一致
- `version` 和目录名一致
- `version` 使用 SemVer
- `minHostVersion` 只在真的依赖新能力时提高

### 11.2 文件和哈希

- `files[]` 里的每个文件都真实存在
- `entry.*.script` 都在 `files[]` 里
- 图标如果被引用，也已经加入 `files[]`
- 已运行过哈希更新工具

### 11.3 文档和市场索引

- `README.md` 写清楚这个插件做什么
- `registry.json` 已登记该插件版本
- 如需下架或紧急禁用，用 `blocked.json`，不要只删文件

可以用下面的命令做一次仓库检查：

```powershell
python tools/validate_repo.py
```

## 12. 推荐的 README 结构

一个插件目录下的 `README.md` 建议至少包含：

- 插件简介
- 支持的平台
- 提供了哪些页面和 slot
- 依赖哪些外部站点或接口
- 有没有网络权限
- 已知限制

## 13. 示例从哪里看

仓库里的示例插件可以这样看：

- `plugins/example.quickstart/1.0.0/`：最小教程型示例，适合第一次照着写
- `plugins/example.hello/1.0.0/`：最小网络请求示例
- `plugins/example.tv.demo/1.0.0/`：TV 端专用示例

如果你只看一个例子，优先看 `example.quickstart`。
