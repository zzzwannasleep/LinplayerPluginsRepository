# Hello 示例

最小可运行插件，适合照抄起步。演示插件最核心的三件事：

1. `ctx.extensions.register('homeStats', { handler })` 注册一个首页统计扩展点。
2. handler 返回 `{ metrics: [{ label, value }] }`，宿主把它渲染在首页媒体计数旁。
3. `settingsPages` + `ctx.ui.showForm` 提供一个设置页，修改后即时刷新。

## 申请权限
`ui`、`storage`、`extensions`

## 试一下
安装启用后，首页会出现「问候: Hello, World」。在插件「设置」里改个称呼保存，回首页即更新。
