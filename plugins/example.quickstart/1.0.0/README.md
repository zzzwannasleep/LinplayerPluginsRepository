# Quickstart Plugin（示例）

这是一个给插件作者看的最小教程型示例。
它只覆盖当前 V1 最核心的三件事：

- 注册一个插件页面
- 往宿主首页和详情页插入内容
- 通过 `onEvent` 返回 `toast` / `navigate`

目录说明：

- `manifest.json`：声明插件 ID、版本、入口、权限、页面和插槽
- `main.js`：真正的插件逻辑，里面是 render / onEvent 函数
- `icon.svg`：页面入口图标

你可以把这个示例和 `SPEC.md` 对照着看。
如果你还想看“打开网站 + 最小网络请求”，继续看 `plugins/example.hello/1.0.0/`。
