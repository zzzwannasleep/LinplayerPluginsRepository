# 开发指南

写一个 LinPlayer 插件不需要 Node、不需要打包器、不需要 TypeScript。
两个文件就是一个插件。

完整字段和 API 见[插件规范](spec.html)。

## 五分钟，第一个插件

### 1. 建两个文件

```
my-plugin/
├── manifest.json
└── main.js
```

`manifest.json`：

```json
{
  "id": "com.example.hello",
  "version": "1.0.0",
  "apiVersion": 2,
  "name": "我的第一个插件",
  "description": "在首页显示一句话。",
  "author": "我",
  "category": "tools",
  "permissions": ["extensions"],
  "contributes": {
    "panels": [
      { "id": "hi", "title": "打个招呼", "slot": "home.stats", "handler": "renderHi" }
    ]
  }
}
```

`main.js`：

```js
'use strict';

function renderHi() {
  return { t: 'stat', label: '心情', value: '还行' };
}
```

就这些。`handler` 指的是一个**全局函数名**，宿主要画这块面板时会调它，
函数返回一棵**界面描述树**。

### 2. 打成 .ipk

`.ipk` 就是个 zip，包根放 `manifest.json` 和 `main.js`。用仓库自带的脚本：

```bash
python tools/pack_plugin.py my-plugin/
```

手工打也行（注意**不要**多包一层目录）：

```bash
cd my-plugin && zip -r ../my-plugin.ipk .
```

### 3. 装进 App

LinPlayer → 侧栏「插件」→「已安装」→ **安装本地插件** → 选那个 .ipk。

装完默认是**停用**的。点启用，会先弹一个权限确认——你在 manifest 里声明了什么，
用户就在这里看到什么。启用后回首页，那句话就在了。

### 4. 改了代码想立刻看效果

「已安装」页底部有**开发者模式**：挂一个本地目录，改完文件 App 会自动重载，
不用每次重新打包。

## 界面怎么写

插件**不写 HTML**，只交一棵 JSON 描述树，宿主用自己的组件去画。

好处是同一份代码在电脑、手机、电视上都长得像原生界面，电视上的遥控器焦点也是白拿的；
代价是只能用规定的那十几种块。

```js
function renderPanel() {
  return {
    t: 'col',
    children: [
      { t: 'text', text: '标题', variant: 'title' },
      { t: 'input', id: 'name', label: '你的名字', value: '' },
      { t: 'button', label: '保存', handler: 'save', variant: 'primary' }
    ]
  };
}

// 按钮的 handler 也是全局函数名，但必须在 manifest 那条 panel 上登记：
//   { "id": "hi", ..., "handler": "renderPanel", "save": "onSave" }
async function onSave(values) {
  // values 的键 = 各个输入控件的 id
  await ctx.storage.set('name', values.name);
  ctx.ui.showToast('保存了');
  return null;          // 返回 null，宿主会自己重新调一次 renderPanel 刷新界面
}
```

想知道有哪些块、每种长什么样：装上官方的**「界面块速查」**插件，
它把每一种都画了一遍并贴上对应的 JSON。

真画不出来的（图表、画布、复杂交互）走 `sandboxViews` 逃生舱，写你自己的网页 ——
见官方的「沙箱界面示例」。

## 写一个数据源

三个函数就是一个完整数据源。写完，浏览页 / 搜索 / 播放 / 续播 / 收藏全是白拿的，
不用新增任何页面。

```js
ctx.onEnable(async function () {
  await ctx.sources.register('mysrc', {
    async listDir(dirId, server) {
      // dirId 为 null = 根目录
      return [
        { id: 'folder-1', name: '电影', isDir: true },
        { id: 'file-1', name: '某部片子.mkv', raw: { url: '...' } }
      ];
    },
    async search(query, server) {
      throw ctx.errors.unsupported();   // 不支持搜索就这么写，UI 会退回本地过滤
    },
    async resolvePlay(entry, qualityId, server) {
      return { url: entry.raw.url };
    }
  });
});
```

`server` 是用户在「添加服务器」里填的东西，表单长什么样由 manifest 里的
`contributes.dataSources[].auth.fields` 决定 —— 你不用自己画登录界面。

照抄官方的 **M3U 直播源** 插件。

## 权限与出网

插件想干什么都要先在 `permissions` 里声明，用户在启用前会逐条看到人话说明。
没声明就调 `ctx.*`，直接抛异常。

出网另有一道白名单 `httpAllowedHosts`，**空的就是完全不能出网**（不是放行）：

```jsonc
"permissions": ["http"],
"httpAllowedHosts": [
  "api.example.com",     // 精确
  "*.example.com",       // 子域通配。裸 "*" 无效
  "$sourceServer"        // 展开成用户自己填的服务器地址
]
```

`$sourceServer` 是给数据源插件用的 —— 你在发布时不可能知道用户的服务器在哪。
它也是**唯一**允许明文 http 的路径（用户自己填了 `http://` 才放行）。

## 为什么我的插件没生效

按这个顺序查，命中率从高到低：

**面板一片空白。**
handler 返回的东西不是一棵合法的描述树。最常见的是返回了 `{ metrics: [...] }`
这种旧版形状 —— 每个节点都必须有 `t` 字段。v2 的界面上会直接告诉你这一点。

**表单里的输入框不见了。**
输入控件的键是 `id`（不是 `key`），初始值是 `value`（不是 `default`）。
没有 `id` 的控件会被整个丢掉，不报错。

**装不上，提示「旧版本」。**
`apiVersion` 必须写 `2`。不写会被当成 v1 直接拒绝。

**装不上，提示某个字段已废弃。**
`runtime` / `extends` / `channel` / `minHostVersion` 都是 v1 的东西，删掉。
`author` 必须是**字符串**，不是 `{"name": "..."}`。

**启用了但什么都没发生。**
检查贡献点要的权限有没有声明：`dataSources` 要 `sources`，`panels` / `actions`
要 `extensions`，`sandboxViews` 要 `sandbox`。少了会在 manifest 校验时被拒。

**请求全部失败，说域名不在白名单。**
`httpAllowedHosts` 是 fail-closed 的。另外裸 `*` 不是通配符，它谁都匹配不上。

**插件里的图片不显示。**
图片节点的键是 `src`（链接节点才是 `url`），且只认 `https://`、`data:image/`、
`lpplugin://` 三种地址。

**改了代码没反应。**
重新打包装一遍，或者用开发者模式挂目录。

## 发布到官方仓库

1. Fork [插件仓库](https://github.com/zzzwannasleep/LinplayerPluginsRepository)
2. 把插件放进 `plugins/<你的id>/<版本号>/`（目录名必须和 manifest 里的 id、version 一致）
3. 跑 `python tools/build.py` —— 它会校验、打包、更新 `registry.json`
4. 提交 `plugins/`、`packages/`、`registry.json`，发 PR

CI 会再校验一遍。校验器带自检（`python tools/validate_repo.py --selftest`），
它认的规则就是 App 认的规则。
