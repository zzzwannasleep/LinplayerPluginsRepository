'use strict';
//
// Hello 示例 —— 最小的 LinPlayer 插件。
//
// 两块面板都在 manifest 的 contributes.panels 里静态声明，各自指了一个**全局函数名**：
//   handler: "renderGreeting"  -> 宿主要画这块面板时调它，函数返回一棵界面描述树
//   save:    "saveSettings"    -> 界面里那个 handler 为 "save" 的按钮被点时调它
//
// 「界面描述树」不是 HTML，是一坨 JSON。宿主拿它用自己的组件去画，
// 所以同一个插件在电脑、手机、电视上长得都像本地界面，遥控器焦点也是白拿的。
//

/** 存过的称呼，没存过就是 World。 */
async function currentName() {
  return (await ctx.storage.get('name')) || 'World';
}

// ── 首页那块：只显示一句问候 ────────────────────────────────────────
async function renderGreeting() {
  const name = await currentName();
  return {
    t: 'col',
    children: [
      { t: 'stat', label: '问候', value: 'Hello, ' + name },
      { t: 'text', text: '在「插件 → Hello 示例 → 设置」里可以改称呼。', variant: 'hint' }
    ]
  };
}

// ── 设置那块：一个输入框 + 一个按钮 ─────────────────────────────────
async function renderSettings() {
  const name = await currentName();
  return {
    t: 'col',
    children: [
      // 输入类节点的键是 **id**（不是 key），初始值的键是 **value**（不是 default）。
      // 写错了这个控件会被宿主整个丢掉 —— 表单一片空白，还不报错。
      { t: 'input', id: 'name', label: '称呼', value: name, placeholder: '比如：小明' },
      { t: 'row', children: [
        { t: 'button', label: '保存', handler: 'save', variant: 'primary' }
      ] }
    ]
  };
}

// 按钮被点时，宿主把界面上所有输入控件的当前值打成一个对象传进来，键就是控件的 id。
async function saveSettings(values) {
  const name = ((values && values.name) || '').trim() || 'World';
  await ctx.storage.set('name', name);
  ctx.ui.showToast('已保存：' + name);
  // 返回 null 的话宿主会自己重新调一次 renderSettings 刷新界面，
  // 所以这里不用手工拼一棵新树回去。
  return null;
}

ctx.onEnable(function () {
  ctx.log.info('Hello 示例已启用');
});

ctx.onDisable(function () {
  ctx.log.info('Hello 示例已停用');
});
