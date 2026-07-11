// UHDNow 求片插件
//
// 一站式在 App 内提交 UHDNow 求片 / 追新，查看自己的求片，浏览热门求片并投票。
// 对应官网 https://www.uhdnow.com/user/help/media-requests。
//
// 登录：在「账号设置」填 uhdnow 网站账号密码；也会回退到添加服务器时的 Emby 账密。
//
// 接口（逆向自 www.uhdnow.com 前端，已实测端点存在）：
//   POST /api/v1/auth/login {username,password}          -> {ok, data:{token}}
//   POST /api/v1/media-requests/search {keyword,page,page_size}
//        -> {ok, data:{list:[{tmdb_id,media_type,title,original_title,year,
//                             poster_path,backdrop_path,overview,library_media_id}]}}
//   POST /api/v1/media-requests {request_type,media_type,tmdb_id,title,...,content}
//   POST /api/v1/media-requests/mine/list {page,page_size}
//   POST /api/v1/media-requests/list     {page,page_size,status?,request_type?}
//   POST /api/v1/media-requests/{id}/vote     加票
//   DELETE /api/v1/media-requests/{id}/vote   取消票
//
// request_type：missing=求片（片库没有）/ refresh=追新（已有内容求更新）。
// status：pending/processing/deferred/rejected/completed。Authorization 头用原始 token。

'use strict';

var API_BASE = 'https://www.uhdnow.com';
var UA = 'Mozilla/5.0';

var STATUS_LABEL = {
  pending: '待处理', processing: '处理中', deferred: '已暂缓',
  rejected: '未通过', completed: '已完成'
};
var TYPE_LABEL = { missing: '求片', refresh: '追新' };
function mediaTypeLabel(t) { return t === 'movie' ? '电影' : (t === 'tv' ? '剧集' : (t || '')); }

// ---------- 登录 ----------
async function getCreds() {
  var u = await ctx.storage.get('site_username');
  var p = await ctx.storage.get('site_password');
  if (u && p) return { username: u, password: p };
  try {
    var c = (await ctx.emby.getCredentials()) || {};
    if (c.username && c.password) return { username: c.username, password: c.password };
  } catch (e) { /* 无权限或未存密码 */ }
  return null;
}

async function login() {
  var creds = await getCreds();
  if (!creds) return { error: 'NO_CREDS' };
  for (var i = 0; i < 3; i++) {
    try {
      var res = await ctx.http.post(
        API_BASE + '/api/v1/auth/login',
        { username: creds.username, password: creds.password },
        { headers: { 'Content-Type': 'application/json', 'User-Agent': UA } }
      );
      var b = res.body;
      if (res.status === 200 && b && b.ok && b.data && b.data.token) {
        await ctx.storage.set('token', b.data.token);
        return { token: b.data.token };
      }
      if (res.status === 400 || res.status === 401 || (b && b.ok === false)) {
        return { error: 'AUTH', msg: (b && b.msg) ? b.msg : ('HTTP ' + res.status) };
      }
      ctx.log.warn('登录返回 ' + res.status);
    } catch (e) {
      ctx.log.warn('登录网络异常，重试: ' + e);
    }
    if (i < 2) await ctx.sleep(400 * (i + 1));
  }
  return { error: 'NETWORK' };
}

async function ensureToken() {
  var token = await ctx.storage.get('token');
  if (token) return { token: token };
  return login();
}

// ---------- HTTP ----------
// 统一请求：method get/post/delete。带 401 自动重登 + 明确的错误分类与日志。
// 返回 { body } 或 { error:'NO_CREDS'|'AUTH'|'NETWORK'|'WHITELIST'|'BIZ', msg }
async function apiReq(method, path, body) {
  var t = await ensureToken();
  if (!t.token) return t;
  var token = t.token;

  for (var i = 0; i < 2; i++) {
    var res;
    try {
      var opts = { headers: { 'Content-Type': 'application/json', 'Authorization': token, 'User-Agent': UA } };
      if (method === 'get') res = await ctx.http.get(API_BASE + path, opts);
      else if (method === 'delete') res = await ctx.http.delete(API_BASE + path, opts);
      else res = await ctx.http.post(API_BASE + path, body || {}, opts);
    } catch (e) {
      var msg = String(e);
      ctx.log.warn(method + ' ' + path + ' 异常: ' + msg);
      if (/白名单|重定向/.test(msg)) return { error: 'WHITELIST', msg: msg };
      return { error: 'NETWORK', msg: msg };
    }
    var rb = res.body;
    if (res.status === 200 && rb && rb.ok) return { body: rb };
    if (res.status === 401 || (rb && rb.msg && /登录|重新登录|token/i.test(rb.msg))) {
      await ctx.storage.delete('token');
      var r = await login();
      if (!r.token) return r;
      token = r.token;
      continue;
    }
    var bm = (rb && rb.msg) ? rb.msg : ('HTTP ' + res.status);
    ctx.log.warn(method + ' ' + path + ' 业务失败: ' + bm);
    return { error: 'BIZ', msg: bm };
  }
  return { error: 'NETWORK' };
}

function errText(r) {
  if (r.error === 'AUTH') return '登录失效，请到账号设置重登';
  if (r.error === 'WHITELIST') return '域名未授权（请反馈开发者）';
  if (r.error === 'NETWORK') return '网络异常，请稍后再试';
  if (r.error === 'NO_CREDS') return '请先在账号设置登录';
  return r.msg || '操作失败';
}

function pickList(body) {
  if (!body || !body.data) return [];
  var d = body.data;
  if (Array.isArray(d)) return d;
  if (Array.isArray(d.list)) return d.list;
  if (Array.isArray(d.items)) return d.items;
  return [];
}

// ---------- 入口菜单 ----------
async function openRequests() {
  var t = await ensureToken();
  if (!t.token) {
    if (t.error === 'NO_CREDS') { if (!(await openAccount())) return; }
    else { ctx.ui.showToast(t.error === 'AUTH' ? ('账号或密码错误：' + (t.msg || '')) : '登录失败，请检查账号或网络'); return; }
  }
  var choice = await ctx.ui.showDialog({
    title: 'UHDNow 求片',
    message: '搜索提交求片 / 追新，查看我的求片，或给热门求片投票。',
    buttons: [
      { id: 'search', label: '搜索求片' },
      { id: 'mine', label: '我的求片' },
      { id: 'hot', label: '热门求片' },
      { id: 'cancel', label: '取消' }
    ]
  });
  if (choice === 'search') await doSearch();
  else if (choice === 'mine') await doList('/api/v1/media-requests/mine/list', '我的求片', false);
  else if (choice === 'hot') await doList('/api/v1/media-requests/list', '热门求片', true);
}

// ---------- 搜索并提交 ----------
async function doSearch() {
  var f1 = await ctx.ui.showForm({
    title: '搜索求片',
    fields: [
      { key: 'keyword', label: '影视名称', type: 'text', default: '', hint: '支持中/英文、原名' },
      { key: 'refresh', label: '追新（已有内容求更新）', type: 'switch', default: false,
        hint: '关=求新片，开=对已有内容追更' }
    ],
    submitLabel: '搜索', cancelLabel: '取消'
  });
  if (!f1) return;
  var keyword = (f1.keyword || '').trim();
  if (!keyword) { ctx.ui.showToast('请输入影视名称'); return; }
  var requestType = f1.refresh ? 'refresh' : 'missing';

  ctx.ui.showToast('搜索中…');
  var r = await apiReq('post', '/api/v1/media-requests/search',
    { keyword: keyword, page: 1, page_size: 12 });
  if (r.error) { ctx.ui.showToast('搜索失败：' + errText(r)); return; }
  var list = pickList(r.body);
  if (!list.length) { ctx.ui.showToast('没有找到「' + keyword + '」'); return; }

  var top = list.slice(0, 8);
  var lines = [];
  for (var i = 0; i < top.length; i++) {
    var it = top[i];
    var meta = [];
    if (it.year) meta.push(String(it.year));
    meta.push(mediaTypeLabel(it.media_type));
    if (it.original_title && it.original_title !== it.title) meta.push(it.original_title);
    var line = (i + 1) + '. ' + (it.title || it.original_title || ('tmdb#' + it.tmdb_id)) +
      '  (' + meta.join(' · ') + ')';
    if (it.overview) line += '\n    ' + String(it.overview).slice(0, 50);
    lines.push(line);
  }

  var f2 = await ctx.ui.showForm({
    title: '选择要' + TYPE_LABEL[requestType] + '的条目',
    fields: [
      { key: 'index', label: '序号', type: 'number', default: 1, hint: '\n' + lines.join('\n') },
      { key: 'content', label: '补充说明（可选）', type: 'text', default: '',
        hint: '如版本、分辨率、集数等诉求' }
    ],
    submitLabel: '提交' + TYPE_LABEL[requestType], cancelLabel: '取消'
  });
  if (!f2) return;
  var idx = Math.round(Number(f2.index));
  if (!(idx >= 1 && idx <= top.length)) { ctx.ui.showToast('序号无效'); return; }
  var pick = top[idx - 1];

  var cr = await apiReq('post', '/api/v1/media-requests', {
    request_type: requestType,
    media_type: pick.media_type,
    tmdb_id: pick.tmdb_id,
    title: pick.title,
    original_title: pick.original_title,
    year: pick.year,
    poster_path: pick.poster_path,
    backdrop_path: pick.backdrop_path,
    overview: pick.overview,
    library_media_id: pick.library_media_id,
    content: (f2.content || '').trim()
  });
  if (cr.error) { ctx.ui.showToast('提交失败：' + errText(cr)); return; }
  ctx.ui.showToast((pick.title || '') + ' ' + TYPE_LABEL[requestType] + '已提交');
}

// ---------- 列表（我的 / 热门）。热门支持投票。----------
async function doList(path, title, votable) {
  ctx.ui.showToast('加载中…');
  var r = await apiReq('post', path, { page: 1, page_size: 20 });
  if (r.error) { ctx.ui.showToast('加载失败：' + errText(r)); return; }
  var list = pickList(r.body);
  if (!list.length) {
    await ctx.ui.showDialog({ title: title, message: '暂无数据。', buttons: [{ id: 'ok', label: '完成' }] });
    return;
  }

  var lines = [];
  for (var i = 0; i < list.length; i++) {
    var it = list[i];
    var m = it.media || it;
    var name = m.title || m.original_title || ('tmdb#' + (m.tmdb_id || it.tmdb_id || '?'));
    var status = STATUS_LABEL[it.status] || it.status || '';
    var type = TYPE_LABEL[it.request_type] || '';
    var votes = (typeof it.vote_count === 'number') ? ('  ♥' + it.vote_count) : '';
    var mine = it.voted_by_me ? '✓' : '';
    lines.push((i + 1) + '. ' + name + '  [' + type + '·' + status + ']' + votes + mine);
  }

  if (!votable) {
    await ctx.ui.showDialog({ title: title + '（' + list.length + '）',
      message: lines.join('\n'), buttons: [{ id: 'ok', label: '完成' }] });
    return;
  }

  // 热门：可投票
  var f = await ctx.ui.showForm({
    title: title + ' · 投票支持',
    fields: [
      { key: 'index', label: '给第几个投票/取消（0=不操作）', type: 'number', default: 0,
        hint: '✓ 表示你已投过，再选一次即取消\n' + lines.join('\n') }
    ],
    submitLabel: '确定', cancelLabel: '关闭'
  });
  if (!f) return;
  var idx = Math.round(Number(f.index));
  if (!(idx >= 1 && idx <= list.length)) return;
  var target = list[idx - 1];
  var voted = !!target.voted_by_me;

  // 加票走 POST，取消票走 DELETE（宿主 ctx.http 已支持 delete）
  var votePath = '/api/v1/media-requests/' + encodeURIComponent(target.id) + '/vote';
  var vr = voted ? await apiReq('delete', votePath) : await apiReq('post', votePath, {});
  if (vr.error) { ctx.ui.showToast((voted ? '取消投票' : '投票') + '失败：' + errText(vr)); return; }
  ctx.ui.showToast(voted ? '已取消投票' : '投票成功');
}

// ---------- 账号设置 ----------
async function openAccount() {
  var info = {};
  try { info = (await ctx.emby.getServerInfo()) || {}; } catch (e) { /* 可无 */ }
  var u = (await ctx.storage.get('site_username')) || (info.username || '');

  var values = await ctx.ui.showForm({
    title: 'UHDNow 求片 · 账号',
    fields: [
      { key: 'username', label: '网站用户名', type: 'text', default: u,
        hint: 'uhdnow 网站登录账号（可能与 Emby 不同）' },
      { key: 'password', label: '网站密码', type: 'password', default: '' }
    ],
    submitLabel: '保存并登录', cancelLabel: '取消'
  });
  if (!values) return false;

  var un = (values.username || '').trim();
  var pw = (values.password || '').trim();
  if (un) await ctx.storage.set('site_username', un);
  if (pw) await ctx.storage.set('site_password', pw);
  await ctx.storage.delete('token');

  var r = await login();
  if (r.token) { ctx.ui.showToast('登录成功，可到「求片 / 我的求片」使用'); return true; }
  if (r.error === 'AUTH') { ctx.ui.showToast('账号或密码错误：' + (r.msg || '')); return false; }
  if (r.error === 'NO_CREDS') { ctx.ui.showToast('请填写账号和密码'); return false; }
  ctx.ui.showToast('登录失败（网络问题），稍后可重试'); return false;
}

ctx.onEnable(function () { ctx.log.info('UHDNow 求片已启用'); });
ctx.onDisable(function () { ctx.log.info('UHDNow 求片已禁用'); });
