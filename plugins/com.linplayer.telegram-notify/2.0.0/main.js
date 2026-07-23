'use strict';
//
// Telegram 播放通知。
//
// 每次 onPlayEnd（一集播完）就往你的 Telegram 发一条消息。
// Bot Token 和 Chat ID 存在插件自己的 storage 里（每个插件互相隔离）。
//

var API = 'https://api.telegram.org';

async function conf() {
  return {
    token: (await ctx.storage.get('botToken')) || '',
    chat: (await ctx.storage.get('chatId')) || '',
    enabled: (await ctx.storage.get('enabled')) !== false
  };
}

/** 发一条消息。返回一句给用户看的结果。 */
async function send(text) {
  var c = await conf();
  if (!c.token || !c.chat) return '还没填 Bot Token 或 Chat ID';

  try {
    var res = await ctx.http.post(
      API + '/bot' + c.token + '/sendMessage',
      { chat_id: c.chat, text: text },
      { headers: { 'Content-Type': 'application/json' } }
    );
    if (res.status >= 200 && res.status < 300) return '';
    // Telegram 出错时 body 里有 description，比光报个状态码有用得多。
    var why = (res.body && res.body.description) ? res.body.description : ('HTTP ' + res.status);
    return '发送失败：' + why;
  } catch (e) {
    return '发送失败：' + e;
  }
}

/** 把当前在播的东西拼成一句人话。 */
function titleOf(media) {
  if (!media) return '一集';
  if (media.seriesName && media.indexNumber != null) {
    var t = media.seriesName + ' 第 ' + media.indexNumber + ' 集';
    if (media.name) t += '《' + media.name + '》';
    return t;
  }
  return media.name || '一集';
}

ctx.player.on('onPlayEnd', async function () {
  var c = await conf();
  if (!c.enabled) return;
  try {
    var media = await ctx.player.getCurrentMedia();
    var err = await send('🎬 你刚看完 ' + titleOf(media));
    if (err) ctx.log.warn(err);
  } catch (e) {
    ctx.log.error('处理播放结束事件失败：' + e);
  }
});

// ── 设置面板 ────────────────────────────────────────────────────────
async function renderSettings() {
  var c = await conf();
  var configured = !!(c.token && c.chat);
  return {
    t: 'col',
    children: [
      { t: 'row', children: [
        { t: 'badge', text: configured ? '已配置' : '未配置', tone: configured ? 'good' : 'warn' }
      ] },
      { t: 'switch', id: 'enabled', label: '看完一集就发通知', value: c.enabled },
      { t: 'input', id: 'botToken', label: 'Bot Token', value: c.token, password: true,
        placeholder: '找 @BotFather 创建 Bot 拿到，形如 123456:ABC-DEF…' },
      { t: 'input', id: 'chatId', label: 'Chat ID', value: c.chat,
        placeholder: '问 @userinfobot 要，通常是一串数字' },
      { t: 'row', children: [
        { t: 'button', label: '保存', handler: 'save', variant: 'primary' },
        { t: 'button', label: '发条测试消息', handler: 'test' }
      ] },
      { t: 'text', text: '只会往 api.telegram.org 发请求 —— 这是插件清单里唯一允许的域名。', variant: 'hint' }
    ]
  };
}

async function saveSettings(v) {
  v = v || {};
  await ctx.storage.set('botToken', String(v.botToken || '').trim());
  await ctx.storage.set('chatId', String(v.chatId || '').trim());
  await ctx.storage.set('enabled', v.enabled !== false);
  ctx.ui.showToast('已保存');
  return null;
}

async function sendTest(v) {
  // 先存再发 —— 不然用户改完还得记得点保存，测的是旧值。
  await saveSettings(v);
  var err = await send('✅ LinPlayer 测试消息：连通了。');
  ctx.ui.showToast(err || '已发送，去 Telegram 看看');
  return null;
}

ctx.onEnable(function () { ctx.log.info('Telegram 播放通知已启用'); });
ctx.onDisable(function () { ctx.log.info('Telegram 播放通知已停用'); });
