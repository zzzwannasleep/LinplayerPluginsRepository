'use strict';
//
// 沙箱界面示例。
//
// 这个插件的界面**不在这个文件里** —— 它在 view/index.html，由 manifest 的
// contributes.sandboxViews 声明，宿主用一个独立 origin 的 iframe 加载它。
//
// 为什么必须是独立 origin 的 iframe：App 主窗口的 JS 上下文里有 Tauri 的 invoke，
// 插件代码要是能进去，就等于拿到了宿主的全部命令，整套权限模型直接作废。
// 所以逃生舱里的网页**拿不到 ctx，也拿不到 App 的任何接口** —— 它就是一张网页。
//
// 换句话说：
//   - 想调 ctx.http / ctx.storage / 数据源 → 写在这个 main.js 里，用声明式界面
//   - 想画声明式界面画不出来的东西（图表、画布、复杂交互）→ 写进 view/
//
// 本文件因此几乎是空的，这是正常的。
//

ctx.onEnable(function () {
  ctx.log.info('沙箱界面示例已启用；界面在 view/index.html');
});

ctx.onDisable(function () {
  ctx.log.info('沙箱界面示例已停用');
});
