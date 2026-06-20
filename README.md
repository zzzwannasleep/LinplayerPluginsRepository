# LinPlayer 插件仓库

LinPlayer 的插件市场仓库：存放插件文件、市场索引、规范文档和校验工具。
插件是跑在 App 内 **QuickJS** 里的 JavaScript，通过受权限控制的 `ctx` 与宿主交互。

> 想了解完整 API 看 [`SPEC.md`](SPEC.md)。想直接上手就照着
> [`plugins/com.linplayer.hello/1.0.0/`](plugins/com.linplayer.hello/1.0.0/) 抄。

## 仓库结构

```
plugins/<id>/<version>/   插件文件，一个插件一个目录，按版本归档
registry.json             市场索引（网页展示 + 客户端查更新）
blocked.json              下架/禁用清单（kill switch）
schemas/                  JSON Schema（manifest / registry / blocked）
tools/                    校验与打包脚本
SPEC.md                   插件规范（完整 API）
index.html                零依赖的静态市场页（Cloudflare Pages）
```

## 5 分钟写一个插件

一个插件至少要 `manifest.json` + `main.js`。

**manifest.json**
```json
{
  "id": "com.example.foo",
  "version": "1.0.0",
  "name": "我的插件",
  "description": "干什么用的",
  "permissions": ["ui", "storage", "extensions"],
  "extends": {
    "settingsPages": [{ "id": "settings", "title": "设置", "handler": "openSettings" }]
  }
}
```

**main.js**
```js
'use strict';

async function homeMetric() {
  const name = (await ctx.storage.get('name')) || 'World';
  return { metrics: [{ label: '问候', value: 'Hello, ' + name }] };
}

async function openSettings() {
  const v = await ctx.ui.showForm({
    title: '设置',
    fields: [{ key: 'name', label: '称呼', type: 'text', default: '' }]
  });
  if (!v) return;
  await ctx.storage.set('name', v.name || 'World');
  ctx.ui.showToast('已保存');
}

ctx.onEnable(async () => {
  await ctx.extensions.register('homeStats', { id: 'hi', title: '问候', handler: homeMetric });
});
```

`ctx` 提供 `log / http / storage / player / ui / emby / extensions / sleep`，
扩展点有 `homeStats / sidebarItems / actions / settingsPages / ...`。完整见 [`SPEC.md`](SPEC.md)。

## 开发流程

1. 新建目录 `plugins/<id>/<version>/`（目录名要和 manifest 的 `id`/`version` 一致）。
2. 照 `com.linplayer.hello` 写 `manifest.json` + `main.js`（可选 `icon.svg`、`README.md`）。
3. 本地校验：
   ```bash
   python tools/validate_repo.py
   ```
4. 打包成 `.lpk` 自测：
   ```bash
   python tools/pack_plugin.py plugins/<id>/<version>/
   # 产物 dist/<id>-<version>.lpk
   ```
   > 插件多了用一键：`python tools/build_all.py`（先校验，再把所有插件打包到 `dist/`）。
5. App「设置 → 插件 → +」选择该 `.lpk` 安装，同意权限后启用。
6. 发布：把插件加入 `registry.json`（见下）。

## 发布到市场

在 `registry.json` 的 `plugins[]` 里加一条，`versions[].manifestUrl` 指向该版本的
`manifest.json`（raw 链接）：

```jsonc
{
  "id": "com.example.foo",
  "name": "我的插件",
  "description": "...",
  "author": { "name": "你" },
  "tags": ["demo"],
  "targets": ["pc", "mobile"],            // 市场筛选用：tv / mobile / pc
  "versions": [{
    "version": "1.0.0",
    "channel": "stable",
    "apiVersion": 1,
    "minHostVersion": "1.0.0",
    "manifestUrl": "https://raw.githubusercontent.com/<owner>/<repo>/<ref>/plugins/com.example.foo/1.0.0/manifest.json"
  }]
}
```

建议 `<ref>` 用 tag 或 commit SHA，不要用 `main`（内容可变，削弱完整性）。
下架某插件/版本：写进 `blocked.json`。

## 安装方式

当前 App 通过本地 `.lpk` 安装（设置 → 插件 → +）。把
`plugins/<id>/<version>/` 目录用 `tools/pack_plugin.py` 打成 `.lpk` 即可。
（市场页的「复制安装链接」给出的是 `manifestUrl`，用于浏览与未来的在线安装。）

## 示例插件

| 插件 | 演示 |
|------|------|
| `com.linplayer.hello` | 最小教程：homeStats + 设置表单 |
| `com.linplayer.telegram-notify` | 监听 onPlayEnd + ctx.http + 设置表单 |
| `com.linplayer.uhdnow-traffic` | emby 服务器检测 + 账密自动登录 + 首页流量统计 |

## 网页市场（Cloudflare Pages）

根目录 `index.html` 是零依赖静态页，自动读 `registry.json` / `blocked.json`，
支持搜索、按端筛选、复制安装链接。部署：仓库连到 Pages，Build command 留空，
输出目录 `.`。

## 免责声明

> 本仓库插件由社区贡献，仅供学习交流。插件可能访问第三方站点并返回不稳定结果。
> 请在合法合规前提下使用。维护者不对插件内容及由此带来的损失负责。
