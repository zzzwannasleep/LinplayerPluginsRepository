# LinPlayer 插件仓库

LinPlayer 的插件市场仓库：存放插件文件、市场索引、规范文档和校验工具。
插件是跑在 App 内 **QuickJS** 里的 JavaScript，通过受权限控制的 `ctx` 与宿主交互。

> 想了解完整 API 看 [`SPEC.md`](SPEC.md)。想直接上手就照着
> [`plugins/com.linplayer.hello/1.0.0/`](plugins/com.linplayer.hello/1.0.0/) 抄。

## 仓库结构

```
plugins/<id>/<version>/   插件源码，一个插件一个目录，按版本归档（manifest=唯一元数据源）
packages/<id>-<ver>.ipk   打包好的安装包（build.py 生成，供市场直接下载）
registry.json             市场索引（build.py 自动生成，勿手改）
blocked.json              下架/禁用清单（kill switch，手动维护）
schemas/                  JSON Schema（manifest / registry / blocked）
tools/build.py            一键：校验 + 生成 registry + 打包所有 .ipk
tools/{pack_plugin,validate_repo}.py  单步打包 / 校验
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

只有两步：写插件 → 跑 `build.py`。`registry.json` 和安装包 `packages/*.ipk` **全自动生成，
不用手碰**。

1. 新建目录 `plugins/<id>/<version>/`（目录名要和 manifest 的 `id`/`version` 一致）。
2. 照 `com.linplayer.hello` 写 `manifest.json` + `main.js`（可选 `icon.svg`、`README.md`）。
   市场展示用的 `tags`/`targets`、`channel`/`apiVersion`/`minHostVersion` 直接写进
   **manifest**（manifest 是唯一元数据源；不写则用默认值）。
3. 构建：
   ```bash
   python tools/build.py
   ```
   它会：① 校验（目录名/入口文件一致）；② 由所有 manifest **自动生成 `registry.json`**；
   ③ 把每个插件打包成 **`packages/<id>-<version>.ipk`**。
4. 自测：App「设置 → 插件 → +」选 `packages/<id>-<version>.ipk` 安装，同意权限后启用。
5. 发布：`git commit` 后推送即可——市场页会自动列出，并给出 `.ipk` 直接下载。

> `.ipk` 就是个 zip（包根含 `manifest.json` + `main.js`），等同 `.apk`/`.ipa` 的安装包形态。
> 旧的 `.lpk` 仍兼容安装。

## 发布到市场（全自动）

**不再手工维护 `registry.json`**。`tools/build.py` 扫描 `plugins/*/*/manifest.json`
自动生成它：`name`/`description`/`author`/`tags`/`targets` 取自 manifest，
`manifestUrl`/`packageUrl` 自动拼成 raw 链接。你只管写 manifest + 跑 build。

- 安装包 `packages/*.ipk` 已纳入版本库，市场页每个版本都有「**下载 .ipk**」直链，
  用户点一下就拿到安装包直接装。
- 下架某插件/版本：写进 `blocked.json`（手动；这是唯一需要手改的索引文件）。

## 安装方式

- **市场下载**：网页市场每个插件/版本有「下载 .ipk」按钮，下载即安装包。
- **本地安装**：App「设置 → 插件 → +」选 `.ipk`（兼容旧 `.lpk`/`.zip`）。

## 示例插件

| 插件 | 演示 |
|------|------|
| `com.linplayer.hello` | 最小教程：homeStats + 设置表单 |
| `com.linplayer.telegram-notify` | 监听 onPlayEnd + ctx.http + 设置表单 |
| `com.linplayer.uhdnow-traffic` | emby 服务器检测 + 账密自动登录 + 首页流量统计 |

## 网页市场（Cloudflare Pages）

根目录 `index.html` 是零依赖静态页，自动读 `registry.json` / `blocked.json`，
支持搜索、按端筛选、**下载 .ipk 安装包**（`packages/*.ipk` 已在版本库里直接托管）。部署：仓库连到 Pages，Build command 留空，
输出目录 `.`。

## 免责声明

> 本仓库插件由社区贡献，仅供学习交流。插件可能访问第三方站点并返回不稳定结果。
> 请在合法合规前提下使用。维护者不对插件内容及由此带来的损失负责。
