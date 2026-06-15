// Hello 示例插件 —— 最小可运行插件，演示三件事：
//   1. ctx.extensions.register 注册一个首页统计（homeStats）
//   2. handler 返回 { metrics: [...] }，宿主渲染在首页媒体计数旁
//   3. settingsPages + ctx.ui.showForm 提供设置页修改数据
//
// 申请权限：ui、storage、extensions（见 manifest.permissions）。

'use strict';

// 首页统计 handler：返回要显示的指标。
async function homeMetric() {
  var name = (await ctx.storage.get('name')) || 'World';
  return { metrics: [{ label: '问候', value: 'Hello, ' + name }] };
}

// 设置页：由 manifest 的 settingsPages.handler = "openSettings" 触发。
async function openSettings() {
  var name = (await ctx.storage.get('name')) || '';
  var values = await ctx.ui.showForm({
    title: 'Hello 设置',
    fields: [
      { key: 'name', label: '称呼', type: 'text', default: name, hint: '会显示成 Hello, <称呼>' }
    ],
    submitLabel: '保存',
    cancelLabel: '取消'
  });
  if (!values) return;
  await ctx.storage.set('name', (values.name || 'World').trim());
  ctx.ui.showToast('已保存');
  await register(); // 重注册以刷新首页缓存
}

async function register() {
  await ctx.extensions.unregister('homeStats', 'hello');
  await ctx.extensions.register('homeStats', {
    id: 'hello',
    title: '问候',
    handler: homeMetric
  });
}

ctx.onEnable(async function () {
  ctx.log.info('Hello 插件已启用');
  await register();
});

ctx.onDisable(function () {
  ctx.log.info('Hello 插件已禁用');
});
