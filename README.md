# 插件市场仓库

这是一个独立于主应用仓库的插件市场仓库，用来存放插件文件、索引和规范文档。

如果你是第一次接触这个仓库，建议不要先看 schema，而是按下面顺序读。

## 先看什么

1. 先读 `SPEC.md`
2. 再看 `plugins/example.quickstart/1.0.0/`
3. 需要网络请求示例时，再看 `plugins/example.hello/1.0.0/`
4. 如果你确实要做 TV，再看 `plugins/example.tv.demo/1.0.0/`

说明：

- `SPEC.md` 是当前更适合直接阅读和照着做的 V1 规范
- `PLUGIN_SPEC_V1.md` 保留为更细的草案文档
- `example.quickstart` 是最小教程型示例，适合直接照抄结构起步
- `example.hello` 是纯网络请求示例

## 仓库里有什么

- `plugins/<pluginId>/<version>/...`：插件文件，一个插件一个目录，按版本归档
- `registry.json`：市场索引，用于网页展示和客户端查更新
- `blocked.json`：下架和禁用清单，用于 kill switch
- `schemas/`：JSON Schema，给编辑器和 CI 校验用
- `tools/`：更新哈希和做仓库检查的脚本
- `SPEC.md`：阅读版规范

## 最短开发流程

1. 新建目录 `plugins/<pluginId>/<version>/`
2. 参考 `plugins/example.quickstart/1.0.0/` 放入 `manifest.json`、`main.js`、可选图标和 README
3. 按 `SPEC.md` 写好 `contributions.pages` 和需要的 `contributions.slots`
4. 运行 `tools/update_manifest_files.py` 或 `tools/update_manifest_files.ps1` 更新 `files[].size` 和 `files[].sha256`
5. 更新 `registry.json`

## 安装链接

用户复制到 App 的安装链接，统一指向某个版本的 `manifest.json`：

```text
https://raw.githubusercontent.com/<owner>/<repo>/<ref>/plugins/<pluginId>/<version>/manifest.json
```

强烈建议 `<ref>` 使用 tag 或 commit SHA，不要使用 `main`，否则同一链接内容可变，完整性校验会被削弱。

## 发布前检查

至少确认这些：

- `id` 和目录名一致
- `version` 和目录名一致
- `entry.*.script` 已加入 `files[]`
- 引用到的图标文件已加入 `files[]`
- 已更新 `registry.json`

如果本机环境可用，可以运行：

```powershell
python tools/validate_repo.py
```

## 前端页面（Cloudflare Pages）

仓库根目录的 `index.html` 是一个零依赖的静态插件市场页：

- 自动读取 `registry.json` / `blocked.json`
- 支持搜索、按端筛选、复制安装链接

部署到 Cloudflare Pages：

- 直接把本仓库连接到 Pages
- Build command：留空，或 `echo skip`
- Build output directory：`.`

## 免责声明建议

> 本仓库插件由社区贡献，仅供学习交流。插件可能访问第三方站点并返回不稳定结果。请在合法合规前提下使用。仓库维护者不对插件内容与由此带来的损失承担责任。
