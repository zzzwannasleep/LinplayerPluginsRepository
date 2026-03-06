# 三端适配范围（MVP）

本仓库提供 3 个“只面向单端”的示例插件，帮助宿主开发者在 **TV / Mobile / PC** 三端验证插件系统的差异与适配范围。

## 示例插件（各端 1 个）

- **TV**：`plugins/example.tv.demo/1.0.0/`
  - `pages`：`/plugin/example.tv.demo/home`
  - `slots`：`home.feed.beforeSections`、`player.appbar.trailing`
  - 重点：`focusId` / `focusNext`、遥控器/D-pad 焦点移动

- **Mobile**：`plugins/example.mobile.demo/1.0.0/`
  - `pages`：`/plugin/example.mobile.demo/home`
  - `slots`：`home.feed.afterSections`、`detail.hero.actions`
  - 重点：触控交互、信息流布局、详情页动作区注入

- **PC**：`plugins/example.pc.demo/1.0.0/`
  - `pages`：`/plugin/example.pc.demo/home`
  - `slots`：`home.feed.beforeSections`、`detail.sections.bottom`、`player.appbar.trailing`
  - 重点：更高信息密度布局（双栏）、鼠标/键盘操作、窗口尺寸变化；以及 `pages.entry` 在 PC 顶栏一级入口的展示（可选）

## 宿主适配清单

### 共同（tv/mobile/pc）

- **安装与校验**：按 `manifest.json` 下载 `files[]` 并做 `sha256` 校验
- **运行时**：加载入口脚本、提供 `ctx`（target/locale/timeZone/hostVersion/plugin/settings/net/storage/log）
- **UI Schema**：渲染 `type/props/children`，并把节点 `event` 分发给对应 `onEvent`
- **Actions 白名单**：至少支持 `toast` / `navigate`，不支持的 action 忽略
- **Slots 合并**：同 `slotId` 多贡献按 `priority` 降序；每个 `slotId` 限制最多 N 个（建议 6）
- **入口**：TV 顶层 Tab「插件」；Mobile/PC 提供「插件中心」列出 `pages`

### TV（Focus / 遥控器）

- **Focus 系统**：支持 `focusId` / `focusNext`；保证插件页面与 slots 区域可“进入/退出”焦点环
- **可用控件**：`iconButton` 在 AppBar actions 区可聚焦、可触发；提示（tooltip）不应依赖 hover
- **布局与性能**：大屏/远距离观看；slots 注入不要导致首页/播放器卡顿

### Mobile（触控 / 小屏）

- **触控命中**：按钮/芯片的可点击区域；避免 slots 过密导致误触
- **SafeArea**：刘海/手势条；播放器 overlay 与底部注入区域避免遮挡
- **导航协作**：系统返回/手势返回与 `navigate(route)` 的路由栈一致

### PC（鼠标 / 键盘 / Resize）

- **Resize**：窗口尺寸变化时布局不崩（`row`/`column` 自适应）
- **鼠标体验**：hover/tooltip（如有）不影响基础可用；滚轮/滚动条行为符合桌面预期
- **键盘**：如支持 Tab 焦点/快捷键，确保插件 UI 不会拦截宿主关键快捷键（v1 可先不做）
