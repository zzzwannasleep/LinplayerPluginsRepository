'use strict';
//
// 界面块速查 —— 把每一种界面块画一遍，旁边贴上生成它的 JSON。
//
// 插件不写 HTML/CSS，只交一棵 JSON 描述树，宿主用自己的组件去画。
// 好处是同一份代码在电脑/手机/电视上都长得像原生界面，遥控器焦点也是白拿的；
// 代价是只能用下面这些块。真放不下的界面走 sandboxViews 逃生舱（见「沙箱示例」插件）。
//
// 上限（超了会被截断，不会报错）：树深 12 层、总节点 400 个、每层子节点 100 个。
//

/** 一个演示条目：左边真画出来，右边贴 JSON。 */
function demo(title, node, note) {
  const children = [
    { t: 'text', text: title, variant: 'title' }
  ];
  if (note) children.push({ t: 'text', text: note, variant: 'hint' });
  children.push(node);
  children.push({ t: 'text', text: JSON.stringify(node), variant: 'mono' });
  children.push({ t: 'divider' });
  return { t: 'col', children: children };
}

function renderCatalogue() {
  return {
    t: 'col',
    children: [
      { t: 'text', text: '这一页的每一块下面都贴着生成它的 JSON，直接抄。', variant: 'hint' },
      { t: 'divider' },

      demo('text · 四种字号', {
        t: 'col',
        children: [
          { t: 'text', text: '标题 title', variant: 'title' },
          { t: 'text', text: '正文 body（不写 variant 就是它）' },
          { t: 'text', text: '弱化说明 hint', variant: 'hint' },
          { t: 'text', text: '等宽 mono · 0x1F600', variant: 'mono' }
        ]
      }),

      demo('row / col · 横排与竖排', {
        t: 'row',
        wrap: true,
        children: [
          { t: 'badge', text: '横' }, { t: 'badge', text: '着' }, { t: 'badge', text: '排' }
        ]
      }, 'row 加 wrap: true 就会自动折行。'),

      demo('badge · 四种语气', {
        t: 'row',
        children: [
          { t: 'badge', text: '普通', tone: 'info' },
          { t: 'badge', text: '正常', tone: 'good' },
          { t: 'badge', text: '注意', tone: 'warn' },
          { t: 'badge', text: '出错', tone: 'danger' }
        ]
      }),

      demo('stat · 一个数字加个标签', {
        t: 'row',
        children: [
          { t: 'stat', label: '已看', value: '128 集' },
          { t: 'stat', label: '剩余流量', value: '42.5 GB', hint: '每月 1 号重置' }
        ]
      }, '首页统计区（slot: home.stats）最常用的就是它。'),

      demo('progress · 进度条', {
        t: 'progress', value: 0.62, label: '正在下载 62%'
      }, 'value 是 0 到 1 的小数，不是百分数。'),

      demo('image · 图片', {
        t: 'image',
        src: 'lpplugin://com.linplayer.ui-kit/icon.svg',
        alt: '本插件图标',
        height: 64
      }, '图片的键是 src（不是 url），链接的键才是 url。只认 https://、data:image/、lpplugin://。'),

      demo('link · 外部链接', {
        t: 'link', text: '打开插件仓库', url: 'https://github.com/zzzwannasleep/LinplayerPluginsRepository'
      }, '点了用系统浏览器打开，不会在 App 里跳走。'),

      demo('button · 三种样子', {
        t: 'row',
        children: [
          { t: 'button', label: '主要', handler: 'demo', variant: 'primary' },
          { t: 'button', label: '普通', handler: 'demo' },
          { t: 'button', label: '危险', handler: 'demo', variant: 'danger' }
        ]
      }, 'handler 是个字符串，指向 manifest 里那条 panel 上的同名字段。'),

      demo('input · 输入框', {
        t: 'col',
        children: [
          { t: 'input', id: 'plain', label: '单行', placeholder: '随便写点什么' },
          { t: 'input', id: 'secret', label: '密码', password: true },
          { t: 'input', id: 'long', label: '多行', multiline: true, value: '预填的内容' }
        ]
      }, '键是 id 不是 key，初始值是 value 不是 default —— 写错了整个控件会被静默丢掉。'),

      demo('select · 下拉', {
        t: 'select', id: 'quality', label: '清晰度', value: '1080',
        options: [
          { value: '2160', label: '4K' },
          { value: '1080', label: '1080P' },
          { value: '720', label: '720P' }
        ]
      }),

      demo('switch · 开关', {
        t: 'switch', id: 'auto', label: '自动播放下一集', value: true
      }),

      demo('list · 可点的列表', {
        t: 'list',
        items: [
          { id: 'a', title: '第一项', subtitle: '副标题写在这里', handler: 'demo' },
          { id: 'b', title: '第二项', handler: 'demo' }
        ]
      }, '点某一项时，handler 会收到 { itemId: "a" }。'),

      demo('divider · 分隔线', { t: 'divider' })
    ]
  };
}

function onDemo(values) {
  const which = (values && values.itemId) ? ('「' + values.itemId + '」') : '按钮';
  ctx.ui.showToast('你点了' + which + '。表单当前值：' + JSON.stringify(values || {}));
  return null;
}

// ── 弹窗类：这些不是描述树，是直接调 ctx.ui.* ────────────────────────
function renderDialogs() {
  return {
    t: 'col',
    children: [
      { t: 'text', text: '下面这些是 ctx.ui.* 直接弹的东西，不走描述树。', variant: 'hint' },
      { t: 'row', wrap: true, children: [
        { t: 'button', label: '一句提示', handler: 'toast' },
        { t: 'button', label: '确认框', handler: 'dialog' },
        { t: 'button', label: '填表单', handler: 'form' },
        { t: 'button', label: '选一项', handler: 'list' },
        { t: 'button', label: '进度条', handler: 'progress' }
      ] }
    ]
  };
}

function demoToast() {
  ctx.ui.showToast('这就是 ctx.ui.showToast');
  return null;
}

async function demoDialog() {
  const ok = await ctx.ui.showDialog({
    title: '确认一下',
    message: 'showDialog 返回 true / false；用户点右上角关掉的话返回 null。',
    confirmLabel: '好',
    cancelLabel: '算了'
  });
  ctx.ui.showToast('你选了：' + JSON.stringify(ok));
  return null;
}

async function demoForm() {
  const v = await ctx.ui.showForm({
    title: '填个表',
    description: 'fields 的每一项：id / label / type / value。type 可以是 text、password、textarea、select、switch。',
    fields: [
      { id: 'nick', label: '昵称', type: 'text', value: '' },
      { id: 'pwd', label: '密码', type: 'password' },
      { id: 'lang', label: '语言', type: 'select', value: 'zh',
        options: [{ value: 'zh', label: '中文' }, { value: 'en', label: 'English' }] },
      { id: 'ok', label: '同意条款', type: 'switch', value: false }
    ],
    submitLabel: '提交'
  });
  // 用户取消 / 关掉窗口时是 null —— 一定要判，不然下一行就炸。
  ctx.ui.showToast(v ? ('拿到：' + JSON.stringify(v)) : '你取消了');
  return null;
}

async function demoList() {
  const picked = await ctx.ui.showList({
    title: '挑一个',
    items: [
      { id: 'x', title: '选项 X', subtitle: '返回的是 id' },
      { id: 'y', title: '选项 Y' }
    ]
  });
  ctx.ui.showToast(picked ? ('选了 ' + picked) : '没选');
  return null;
}

async function demoProgress() {
  await ctx.ui.showProgress({ title: '假装在忙' });
  for (let i = 1; i <= 5; i++) {
    await ctx.sleep(300);
    ctx.ui.updateProgress({ value: i / 5 });
  }
  ctx.ui.closeProgress();
  ctx.ui.showToast('忙完了');
  return null;
}

ctx.onEnable(function () { ctx.log.info('界面块速查已启用'); });
ctx.onDisable(function () { ctx.log.info('界面块速查已停用'); });
