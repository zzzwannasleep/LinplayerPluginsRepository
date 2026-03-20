# LinPlayer 插件规范（V1 详细草案）

## 0. 文档状态

本文面向 **插件作者**，用于统一 LinPlayer 插件的目录结构、清单格式、运行时约定、UI Schema 写法和提交要求。

本文是 **目标 V1 规范**。如果宿主当前版本尚未完整实现本文所有能力，应以宿主发布说明为准。

当前 V1 关注的目标平台：

- PC：Windows、macOS
- Mobile：iOS、Android

本文暂不覆盖：

- Linux
- TV

## 1. 这份文档解决什么问题

插件作者在多人协作时，最容易出现下面几类问题：

- 同一个插件有人按“网页嵌入”思路写，有人按“宿主卡片”思路写
- 插件页面的路由、入口、字段命名各写各的
- 数据源获取、缓存、错误处理没有统一习惯
- 有人做 PC 样式，有人完全不考虑移动端
- 仓库里的 `manifest.json`、README、代码结构缺少统一约束

本文的目标就是把这些内容提前定下来。

## 2. V1 插件可以做什么

V1 插件只允许做两类事情。

### 2.1 提供独立页面

你可以做一个插件页面，放在宿主的“插件中心”中。

典型场景：

- 一个抓取网站内容的专题页
- 一个工具页
- 一个资源导航页
- 一个像首页一样由多个 section 组成的内容页

### 2.2 注入宿主插槽

你可以在宿主预留的位置插入卡片、按钮或小组件。

典型场景：

- 首页上方的一张推荐卡片
- 首页下方的一块外部内容摘要
- 详情页操作区的附加按钮
- 详情页底部的一组扩展信息
- 播放器右上角的一枚工具按钮

## 3. V1 不允许做什么

下面这些能力不属于 V1：

- 直接注入任意 Flutter Widget
- 直接注入原生平台控件
- 后台定时任务
- 常驻抓取
- 播放源解析
- 接管宿主首页
- 改写宿主数据库
- 以完整网页嵌入作为主要展示模式

因此，V1 的核心原则只有一句话：

**插件提供结构化数据和结构化 UI，宿主负责渲染和交互执行。**

## 4. 插件设计原则

如果你准备做一个可长期维护的社区插件，建议遵守以下原则：

### 4.1 宿主优先

不要把插件当成“塞一个网页进去”。

优先做法：

- 抓取数据
- 解析数据
- 标准化数据
- 用宿主白名单组件展示

### 4.2 权限最小化

网络权限只申请你真正要访问的域名，不要动不动用 `"*"`。

### 4.3 跨端优先考虑

即使你最终只做 PC，也建议一开始就想清楚：

- 页面结构是否可以自然缩成单栏
- 是否依赖 hover
- 是否依赖过宽的工具栏区域

### 4.4 失败可见

每个插件页面至少应该能区分：

- loading
- empty
- error

不要让用户看到白屏，也不要把错误静默吞掉。

### 4.5 单一职责

一个插件最好围绕一个主题，不要把“资讯页 + 设置页 + 播放源解析 + 爬虫后台任务”全部塞进一个包。

## 5. 先决定你的插件类型

在开工前，先判断你做的是哪一类插件。

### 5.1 页面型插件

适合：

- 有完整独立功能页
- 需要多 section、多卡片、多状态切换
- 需要类似首页的信息流展示

### 5.2 插槽型插件

适合：

- 只是在宿主某个位置加一个小入口
- 只加一小块扩展信息
- 只加一个工具按钮

### 5.3 组合型插件

适合：

- 既要在首页 / 详情页加入口
- 又要点进去打开完整页面

这是最推荐的 V1 形态。

### 5.4 网页内容结构化展示型插件

适合：

- 数据来自网站
- 但最终以宿主卡片、列表、section 的方式展示

这也是你现在描述的重点需求，V1 推荐按这一类来做。

## 6. 插件目录结构

标准目录：

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

## 7. 命名与版本规则

### 7.1 pluginId

建议使用反向域名格式，例如：

- `com.example.news`
- `org.demo.catalog`

要求：

- 全局唯一
- 稳定，不要随版本变化
- 不要用空格
- 不要用中文

### 7.2 version

必须使用 SemVer，例如：

- `1.0.0`
- `1.1.0`
- `2.0.0`

建议规则：

- 修 bug：补丁版本加一
- 新增兼容能力：次版本加一
- 破坏兼容：主版本加一

### 7.3 minHostVersion

表示插件要求的最低宿主版本。

如果你的插件开始依赖新的白名单组件或新的 slot，就必须把这个字段同步提高。

## 8. manifest.json 总览

最小参考示例：

```json
{
  "schemaVersion": 1,
  "id": "com.example.news",
  "name": "News Plugin",
  "description": "示例：抓取网站内容并展示为插件页面",
  "version": "1.0.0",
  "apiVersion": 1,
  "minHostVersion": "1.0.0",
  "targets": ["pc", "mobile"],
  "entry": {
    "pc": { "script": "main.js" },
    "mobile": { "script": "main.js" }
  },
  "permissions": {
    "network": {
      "enabled": true,
      "domains": ["example.com", "api.example.com"]
    }
  },
  "files": [
    {
      "path": "main.js",
      "size": 1234,
      "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    }
  ],
  "contributions": {
    "pages": [
      {
        "id": "home",
        "title": "News",
        "route": "/plugin/com.example.news/home",
        "targets": ["pc", "mobile"],
        "render": "page_home_render",
        "onEvent": "page_home_onEvent",
        "order": 0,
        "entry": true
      }
    ],
    "slots": [
      {
        "id": "news_home",
        "title": "News Home Card",
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

## 9. manifest 顶层字段详解

### 9.1 `schemaVersion`

固定写 `1`。

### 9.2 `id`

插件唯一 ID。安装、升级、禁用、卸载、缓存隔离都依赖它。

### 9.3 `name`

插件展示名称。

要求：

- 简短
- 可读
- 避免和其他插件重名

### 9.4 `description`

插件简介，用于市场、插件中心、README 概要。

建议写清楚：

- 插件做什么
- 数据来自哪里
- 支持哪些页面或插槽

### 9.5 `version`

插件版本号，必须是合法 SemVer。

### 9.6 `apiVersion`

当前 V1 固定写 `1`。

### 9.7 `minHostVersion`

最低宿主版本要求。

如果你开始依赖 `grid`、`iconButton`、新 slot、新 action，就应该同步提高这个字段。

### 9.8 `targets`

表示插件支持哪些端。

V1 推荐只使用：

- `pc`
- `mobile`

如果你只做桌面端：

```json
["pc"]
```

如果你要同时支持桌面和移动：

```json
["pc", "mobile"]
```

### 9.9 `entry`

每个 target 对应一个入口脚本。

你可以：

- 桌面和移动共用一个 `main.js`
- 也可以给不同端写不同脚本

例如：

```json
{
  "pc": { "script": "main.pc.js" },
  "mobile": { "script": "main.mobile.js" }
}
```

### 9.10 `permissions`

当前 V1 只有网络权限。

### 9.11 `files`

列出所有要下载并校验的文件。

要求：

- `main.js` 必须出现在 `files[]`
- 如果用了图标，也必须出现在 `files[]`
- 每个文件都必须填写 `size` 和 `sha256`

### 9.12 `contributions`

插件对宿主提供的能力声明。

当前 V1 只关注：

- `pages`
- `slots`

## 10. 权限规范

### 10.1 网络权限

如果插件需要网络请求，写法如下：

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

### 10.2 权限原则

- 不声明等于无权限
- `enabled: false` 等于无权限
- 域名白名单尽量缩小
- 不建议使用 `"*"`

### 10.3 什么时候应该拆插件

如果你的插件需要访问很多互不相关的域名，通常说明它职责过大，建议拆成两个插件。

## 11. 运行时上下文

宿主会给每个 handler 传入 `ctx`。

V1 可用字段：

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

## 12. 运行时函数签名

### 12.1 页面函数

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

### 12.2 插槽函数

```js
function slot_home_render(ctx, params = {}, state = {}) {
  return {
    state,
    schema: {
      type: "card",
      children: [
        { type: "text", props: { text: "Hello" } }
      ]
    }
  };
}

function slot_home_onEvent(ctx, event = {}, state = {}) {
  return { state };
}
```

## 13. state 约定

V1 里，`state` 是你在页面或插槽里的本地状态快照。

推荐用途：

- 当前 tab
- 当前筛选条件
- 当前页码
- 最近一次请求状态
- 缓存后的列表数据

不推荐把 `state` 当成：

- 长期持久化数据库
- 大量原始 HTML 文本存储
- 无限增长的日志容器

需要长期保存的数据请用 `ctx.storage`。

## 14. 网络请求规范

### 14.1 推荐请求对象

```js
{
  url: "https://example.com/api/list",
  method: "GET",
  headers: {
    "User-Agent": "com.example.news/1.0.0",
    "Accept": "application/json"
  },
  body: null,
  timeoutMs: 15000,
  responseType: "json"
}
```

### 14.2 推荐做法

- 把远程请求封装成单独函数
- 对每个请求都做 `try/catch`
- 对返回结构做校验
- 对空数组、空对象、接口变更做降级

### 14.3 缓存建议

推荐使用：

- `ctx.storage.set("cache:list", data)`
- `ctx.storage.set("cache:updatedAt", Date.now())`

然后在 `render()` 中决定：

- 是否用缓存直接展示
- 是否立即刷新
- 是否显示“上次更新于”提示

## 15. 自定义数据来源该怎么做

你提到“卡片可以自定义数据来源”，V1 建议这样理解和实现。

### 15.1 数据来源由插件自己管理

也就是说：

- 宿主不提供专门的数据源 DSL
- 宿主不帮你写爬虫规则
- 宿主只提供网络、缓存和渲染能力

### 15.2 推荐的数据层拆分

一个插件最好至少拆成三层思维：

1. 远程源：请求网站或 API
2. 视图模型：把远程数据转成页面需要的统一结构
3. 渲染层：把视图模型转成 UI Schema

### 15.3 不推荐的写法

不推荐这样做：

- 在 `render()` 里直接拼大量请求逻辑
- 把第三方 HTML 原样塞给宿主显示
- 页面结构和远程接口字段强绑定，接口一变全页面坏掉

## 16. 页面规范（pages）

页面用于提供插件自己的完整功能页。

### 16.1 页面字段

每个 `pages[]` 至少包含：

- `id`
- `title`
- `route`
- `render`
- `onEvent`

可选字段：

- `targets`
- `icon`
- `order`
- `entry`

### 16.2 页面路由

要求：

- 必须以 `/plugin/` 开头
- 必须稳定
- 一个插件内部不要重复

推荐格式：

```text
/plugin/<pluginId>/<pageId>
```

例如：

```text
/plugin/com.example.news/home
```

### 16.3 页面入口

`entry: true` 表示：

- 这个页面可以被宿主作为推荐入口展示

这通常适合：

- 插件首页
- 主功能页

不适合：

- 详情页
- 设置页
- 调试页

### 16.4 页面排序

`order` 越小越靠前。

建议：

- 主入口页：`0`
- 备用页：`10`
- 管理页：`50`

## 17. 如何做“像首页一样”的插件页面

这是你当前最关心的场景，建议直接按“多 section 页面”设计。

### 17.1 推荐结构

推荐页面结构：

- 顶部标题区
- 一组 section
- 每个 section 下面是 card list 或 grid

### 17.2 推荐页面 schema

```js
function page_home_render(ctx, params = {}, state = {}) {
  const sections = state.sections ?? [];

  return {
    title: "News",
    state,
    schema: {
      type: "page",
      props: { gap: 16 },
      children: [
        {
          type: "section",
          props: {
            title: "今日更新",
            subtitle: "来自 example.com"
          },
          children: [
            {
              type: "grid",
              props: { columns: ctx.target === "pc" ? 3 : 1, gap: 12 },
              children: sections.map((item) => ({
                type: "card",
                children: [
                  { type: "text", props: { text: item.title, bold: true } },
                  { type: "text", props: { text: item.summary } },
                  {
                    type: "button",
                    props: {
                      text: "打开",
                      event: {
                        name: "open_item",
                        payload: { url: item.url }
                      }
                    }
                  }
                ]
              }))
            }
          ]
        }
      ]
    }
  };
}
```

### 17.3 PC 与移动端差异

建议在插件里自己判断：

- `pc` 端可以 2 到 4 列
- `mobile` 端优先 1 列

不要把 PC 的三列布局硬塞到手机上。

## 18. 插槽规范（slots）

插槽用于在宿主已有页面中插入 UI。

### 18.1 V1 统一 slotId

- `home.feed.beforeSections`
- `home.feed.afterSections`
- `detail.hero.actions`
- `detail.sections.bottom`
- `player.appbar.trailing`

### 18.2 插槽设计原则

- 首页 slot 做入口卡片和摘要卡片
- 详情页操作区 slot 做轻量按钮
- 详情页底部 slot 做扩展信息
- 播放器 slot 做小型按钮，不要做大卡片

### 18.3 插槽大小控制

推荐：

- `player.appbar.trailing` 只放 1 到 3 个小按钮
- `detail.hero.actions` 只放 1 到 3 个操作项
- `home.feed.beforeSections` 和 `detail.sections.bottom` 可放卡片

## 19. 宿主会传入的常见 params

### 19.1 首页

```json
{
  "page": "home"
}
```

### 19.2 详情页

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

### 19.3 播放器

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

插件不要假设所有字段一定存在。必须自己做空值判断。

## 20. UI Schema 总体规则

一个节点通常长这样：

```json
{
  "type": "text",
  "props": {
    "text": "Hello"
  },
  "children": []
}
```

交互型节点一般在 `props` 中放 `event`：

```json
{
  "type": "button",
  "props": {
    "text": "打开",
    "event": {
      "name": "open",
      "payload": {
        "id": "123"
      }
    }
  }
}
```

## 21. V1 白名单节点详解

### 21.1 布局节点

#### `page`

页面根容器。

常见 props：

- `gap`
- `padding`

#### `section`

带标题的内容区块。

常见 props：

- `title`
- `subtitle`
- `gap`

#### `row`

横向排列。

常见 props：

- `gap`

#### `column`

纵向排列。

常见 props：

- `gap`

#### `list`

列表容器，通常可视为纵向排列的一种语义化写法。

#### `grid`

网格容器。

常见 props：

- `columns`
- `gap`

#### `card`

信息卡片或操作卡片容器。

#### `divider`

分隔线。

#### `spacer`

空白占位。

常见 props：

- `size`

### 21.2 内容节点

#### `text`

文本。

常见 props：

- `text`
- `size`
- `bold`
- `align`
- `selectable`

#### `markdown`

格式化文本。建议只用于少量说明文本，不要把整篇网页原文直接塞进去。

#### `image`

图片。

常见 props：

- `url`
- `width`
- `height`
- `fit`

#### `badge`

轻量信息标签。

常见 props：

- `text`
- `tone`

### 21.3 交互节点

#### `button`

普通按钮。

常见 props：

- `text`
- `event`
- `enabled`

#### `iconButton`

图标按钮。

常见 props：

- `icon`
- `tooltip`
- `event`

图标必须来自宿主支持的白名单名称。

#### `chip`

轻量按钮或筛选标签。

常见 props：

- `text`
- `event`

### 21.4 状态节点

#### `loading`

加载中。

#### `empty`

空态。

常见 props：

- `message`

#### `error`

错误态。

常见 props：

- `message`

## 22. Action 规范

V1 允许以下 Action：

- `toast`
- `navigate`
- `openUrl`

### 22.1 `toast`

```js
{ type: "toast", message: "加载成功" }
```

### 22.2 `navigate`

```js
{
  type: "navigate",
  route: "/plugin/com.example.news/home",
  params: {}
}
```

### 22.3 `openUrl`

```js
{
  type: "openUrl",
  url: "https://example.com"
}
```

## 23. 推荐代码组织方式

即使只有一个 `main.js`，也建议你在文件内按功能组织。

推荐结构：

- 网络请求函数
- 数据标准化函数
- 页面 render 函数
- 页面 onEvent 函数
- 插槽 render 函数
- 插槽 onEvent 函数

例如：

```js
async function fetchFeed(ctx) {}
function normalizeFeed(raw) {}
function page_home_render(ctx, params, state) {}
async function page_home_onEvent(ctx, event, state) {}
function slot_home_render(ctx, params, state) {}
function slot_home_onEvent(ctx, event, state) {}
```

## 24. 推荐错误处理方式

一个成熟的插件不应该只考虑成功路径。

建议：

- 请求前返回 `loading`
- 请求成功但无数据时返回 `empty`
- 请求失败时返回 `error`
- 可在错误态按钮里提供 `retry`

## 25. 推荐缓存策略

如果你的数据来自外部网站，建议：

- 用 `ctx.storage` 保存最近一次成功结果
- 页面初次打开先读缓存
- 缓存过期后再发起刷新

缓存键建议按模块拆分：

- `cache:feed`
- `cache:detail:<id>`
- `cache:updatedAt`

## 26. “网页做成插件页面”的推荐方式

这类插件最容易做坏，因此单独强调。

### 26.1 推荐方式

推荐：

- 请求网页或网页背后的接口
- 解析出结构化数据
- 只把你需要展示的字段映射成宿主卡片

### 26.2 不推荐方式

不推荐：

- 直接把第三方网页 HTML 原样显示
- 依赖远程网页 DOM 结构完全不变
- 把页面渲染逻辑写成“能跑就行”的硬编码脚本

### 26.3 更稳的思路

把一个网页插件拆成：

1. 源站适配层
2. 标准化数据层
3. UI 渲染层

这样以后源站改版时，你只需要修适配层。

## 27. 移动端与桌面端设计建议

### 27.1 PC

适合：

- 双栏
- 多列 grid
- 信息密度高一点的卡片

### 27.2 Mobile

适合：

- 单栏
- 简短文案
- 大点击区域
- 少量横向布局

### 27.3 通用建议

- 不要依赖 hover 才能使用
- 不要让核心按钮只在大屏上看起来合理
- 不要把播放器工具栏当成卡片区

## 28. README 建议包含什么

每个插件仓库目录建议至少写一个简短 README，包含：

- 插件做什么
- 数据来源
- 支持哪些端
- 支持哪些页面 / slot
- 是否需要网络权限
- 截图或示意图

## 29. 提交前检查清单

- [ ] `manifest.json` 字段完整
- [ ] `id`、`version`、`route` 合法
- [ ] 所有资源文件都列入 `files[]`
- [ ] `files[].size` 已更新
- [ ] `files[].sha256` 已更新
- [ ] 网络域名白名单已最小化
- [ ] 页面具备 `loading / empty / error`
- [ ] 插槽渲染失败不会让页面整体不可用
- [ ] 桌面端或移动端至少有一个目标端完整验证通过
- [ ] README 已说明数据来源与权限

## 30. 常见反模式

不要这样做：

- 一个 `render()` 函数里塞完所有逻辑
- 把外部网站 HTML 原样返回
- 使用过大的网络权限范围
- 不处理接口错误和空数据
- 只做桌面宽屏布局，却声明同时支持移动端
- 在播放器 slot 中放大卡片或复杂布局

## 31. 什么时候应该升级插件版本

你应该升级版本号的情况：

- 修复 bug
- 改动页面结构
- 改动路由
- 改动网络来源
- 新增页面
- 新增插槽
- 提高最低宿主版本要求

## 32. V1 之后再考虑的能力

下面这些能力不属于当前 V1：

- `settingsSchema`
- `tasks`
- `uiComponents`
- `playSources`
- 完整网页嵌入模式

如果你的插件必须依赖这些能力，应先推动宿主版本升级和协议升级，而不是自行扩展 V1。

