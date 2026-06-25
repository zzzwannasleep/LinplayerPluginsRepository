// CF 优选反代
//
// 大多数 Emby 免费线路走 Cloudflare。CF 是 anycast，按 SNI/Host 调度回源——
// 连到哪个 CF 边缘 IP 都能回到你的源站。于是从本地实测挑出对**你的网络**最快的
// 边缘 IP，再通过「本地反代」把该服务器的线路改写到这个优选 IP，即可显著改善
// 卡顿/起播慢。比用公共优选 IP 更贴合本地网络环境。
//
// 真正的测速引擎、本地反代、定时复测都在宿主（App）里完成（沙箱内无法开原始
// 套接字/本地服务/后台定时器）。本插件是很薄的一层：打开可视化面板、在启用/禁用
// 时恢复或拆除反代。
//
// 需要权限：cfproxy（测速+反代）、ui（提示）、extensions（注册设置入口）。

'use strict';

// 设置页 / 侧边栏入口：打开宿主提供的「优选反代」可视化面板。
// 面板里可：选服务器 → 测速并反代（带实时进度）→ 开定时测速 → 自定义测速文件 → 关闭反代。
async function openPanel() {
  try {
    await ctx.cfproxy.openPanel();
  } catch (e) {
    ctx.ui.showToast('打开优选面板失败: ' + e);
  }
}

ctx.onEnable(async function () {
  ctx.log.info('CF 优选反代已启用');
  // 恢复上次保存的反代与定时测速（沿用上次优选到的 IP，不重新测速）。
  try {
    await ctx.cfproxy.restore();
  } catch (e) {
    ctx.log.warn('恢复反代失败: ' + e);
  }
});

ctx.onDisable(async function () {
  ctx.log.info('CF 优选反代已禁用，拆除全部反代');
  // 拆除所有本地反代与定时器，服务器线路恢复直连（配置保留，下次启用可恢复）。
  try {
    await ctx.cfproxy.teardown();
  } catch (e) {
    ctx.log.warn('拆除反代失败: ' + e);
  }
});
