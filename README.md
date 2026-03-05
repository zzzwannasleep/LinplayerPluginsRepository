# 插件市场仓库（模板）

这是一个**独立于主应用仓库**的插件市场/插件仓库模板。你可以把整个目录单独建一个 GitHub 公共仓库，然后用 Cloudflare Pages 做静态展示页（可选再加 Worker 做 API/缓存/CORS）。

## 你将得到什么

- `plugins/<pluginId>/<version>/...`：一个插件一个文件夹、按版本归档
- `registry.json`：市场索引（网页展示、客户端查更新）
- `blocked.json`：下架/禁用（kill switch）
- `schemas/`：JSON Schema（给编辑器/CI 校验用）
- `tools/`：校验与更新哈希的脚本（可选）

## 安装链接（用户从网页复制到 App）

**安装链接统一指向某个版本的 `manifest.json` 的 GitHub Raw 链接**：

```text
https://raw.githubusercontent.com/<owner>/<repo>/<ref>/plugins/<pluginId>/<version>/manifest.json
```

强烈建议 `<ref>` 使用 **tag 或 commit SHA**（不可变），不要用 `main`，否则同一链接内容会变化，`sha256` 校验的意义会被削弱。

## 发布流程（最简）

1. 新建目录 `plugins/<pluginId>/<version>/`
2. 放入入口脚本/资源（例如 `main.js`、`icon.svg`）
3. 编写 `manifest.json`
4. 运行 `tools/update_manifest_files.py` 或 `tools/update_manifest_files.ps1` 生成/更新 `files[].sha256`
5. 更新 `registry.json`（给网页展示与 App 查版本用）

## 免责声明建议（示例）

> 本仓库插件由社区贡献，仅供学习交流。插件可能访问第三方站点并返回不稳定结果。请在合法合规前提下使用。仓库维护者不对插件内容与由此带来的损失承担责任。

更完整的规范见：`SPEC.md`。

