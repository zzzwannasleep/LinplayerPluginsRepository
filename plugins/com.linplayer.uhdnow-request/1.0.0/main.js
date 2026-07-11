// UHDNow 求片插件
//
// 一站式在 App 内提交 UHDNow 求片 / 追新，并查看自己已提交的求片。对应官网
// https://www.uhdnow.com/user/help/media-requests。
//
// 登录：在「账号设置」里填 uhdnow 网站账号密码；也会回退到添加服务器时填的 Emby 账密。
//
// 接口（逆向自 www.uhdnow.com 前端，与官网求片页一致）：
//   POST /api/v1/auth/login {username,password}       -> {ok, data:{token}}
//   POST /api/v1/media-requests/search {keyword,page,page_size}
//        -> {ok, data:{list:[{tmdb_id,media_type,title,original_title,year,
//                             poster_path,backdrop_path,overview,library_media_id}]}}
//   POST /api/v1/media-requests {request_type,media_type,tmdb_id,title,...,content}
//        -> {ok, data:{...}}                           创建求片
//   POST /api/v1/media-requests/mine/list {page,page_size}
//        -> {ok, data:{list:[{id,request_type,status,vote_count,media:{title,media_type}}]}}
//
// request_type：missing=求片（片库没有）/ refresh=追新（已有内容求更新）。
// status：pending/processing/deferred/rejected/completed。
// Authorization 头用原始 token（非 Bearer）。

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
function authPost(path, body, token) {
  return ctx.http.post(API_BASE + path, body, {
    headers: { 'Content-Type': 'application/json', 'Authorization': token, 'User-Agent': UA }
  });
}

// 从 {data:{list:[]}} / {data:[]} 两种形态取列表
function pickList(body) {
  if (!body || !body.data) return [];
  var d = body.data;
  if (Array.isArray(d)) return d;
  if (Array.isArray(d.list)) return d.list;
  if (Array.isArray(d.items)) return d.items;
  return [];
}

// 带 401 自动重登的 POST。返回 { body, token } 或 { error, msg }。
async function postWithAuth(path, body) {
  var t = await ensureToken();
  if (!t.token) return t;
  var token = t.token;
  for (var i = 0; i < 2; i++) {
    var res;
    try { res = await authPost(path, body, token); }
    catch (e) { return { error: 'NETWORK' }; }
    var rb = res.body;
    if (res.status === 200 && rb && rb.ok) return { body: rb, token: token };
    if (res.status === 401 || (rb && rb.msg && /登录|token/i.test(rb.msg))) {
      await ctx.storage.delete('token');
      var r = await login();
      if (!r.token) return r;
      token = r.token;
      continue;
    }
    // 业务失败（如已存在），把服务端消息透传出去
    return { error: 'BIZ', msg: (rb && rb.msg) ? rb.msg : ('HTTP ' + res.status) };
  }
  return { error: 'NETWORK' };
}

// ---------- 入口菜单 ----------
async function openRequests() {
  var t = await ensureToken();
  if (!t.token) {
    if (t.error === 'NO_CREDS') {
      var ok = await openAccount();
      if (!ok) return;
    } else {
      ctx.ui.showToast(t.error === 'AUTH' ? ('账号或密码错误：' + (t.msg || '')) : '登录失败，请检查账号或网络');
      return;
    }
  }
  var choice = await ctx.ui.showDialog({
    title: 'UHDNow 求片',
    message: '搜索并提交求片 / 追新，或查看我的求片。',
    buttons: [
      { id: 'search', label: '搜索求片' },
      { id: 'mine', label: '我的求片' },
      { id: 'cancel', label: '取消' }
    ]
  });
  if (choice === 'search') await doSearch();
  else if (choice === 'mine') await doMine();
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
    submitLabel: '搜索',
    cancelLabel: '取消'
  });
  if (!f1) return;
  var keyword = (f1.keyword || '').trim();
  if (!keyword) { ctx.ui.showToast('请输入影视名称'); return; }
  var requestType = f1.refresh ? 'refresh' : 'missing';

  ctx.ui.showToast('搜索中…');
  var r = await postWithAuth('/api/v1/media-requests/search',
    { keyword: keyword, page: 1, page_size: 12 });
  if (r.error) {
    ctx.ui.showToast(r.error === 'AUTH' ? '登录失效，请到账号设置重登' : ('搜索失败：' + (r.msg || r.error)));
    return;
  }
  var list = pickList(r.body);
  if (!list.length) { ctx.ui.showToast('没有找到「' + keyword + '」'); return; }

  var top = list.slice(0, 8);
  var msg = [];
  for (var i = 0; i < top.length; i++) {
    var it = top[i];
    var extra = [];
    if (it.year) extra.push(String(it.year));
    extra.push(mediaTypeLabel(it.media_type));
    if (it.original_title && it.original_title !== it.title) extra.push(it.original_title);
    msg.push((i + 1) + '. ' + (it.title || it.original_title || ('tmdb#' + it.tmdb_id)) +
      '  (' + extra.join(' · ') + ')');
  }

  var f2 = await ctx.ui.showForm({
    title: '选择要' + TYPE_LABEL[requestType] + '的条目',
    fields: [
      { key: 'index', label: '序号', type: 'number', default: 1,
        hint: '\n' + msg.join('\n') },
      { key: 'content', label: '补充说明（可选）', type: 'text', default: '',
        hint: '如版本、分辨率、集数等诉求' }
    ],
    submitLabel: '提交' + TYPE_LABEL[requestType],
    cancelLabel: '取消'
  });
  if (!f2) return;
  var idx = Math.round(Number(f2.index));
  if (!(idx >= 1 && idx <= top.length)) { ctx.ui.showToast('序号无效'); return; }
  var pick = top[idx - 1];

  var cr = await postWithAuth('/api/v1/media-requests', {
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
  if (cr.error) {
    ctx.ui.showToast(cr.error === 'BIZ' ? (cr.msg || '提交失败') : ('提交失败：' + (cr.msg || cr.error)));
    return;
  }
  ctx.ui.showToast((pick.title || '') + ' ' + TYPE_LABEL[requestType] + '已提交');
}

// ---------- 我的求片 ----------
async function doMine() {
  ctx.ui.showToast('加载中…');
  var r = await postWithAuth('/api/v1/media-requests/mine/list', { page: 1, page_size: 20 });
  if (r.error) {
    ctx.ui.showToast(r.error === 'AUTH' ? '登录失效，请到账号设置重登' : ('加载失败：' + (r.msg || r.error)));
    return;
  }
  var list = pickList(r.body);
  if (!list.length) {
    await ctx.ui.showDialog({ title: '我的求片', message: '你还没有提交过求片。',
      buttons: [{ id: 'ok', label: '完成' }] });
    return;
  }
  var lines = [];
  for (var i = 0; i < list.length; i++) {
    var it = list[i];
    var m = it.media || it;
    var title = m.title || m.original_title || ('tmdb#' + (m.tmdb_id || it.tmdb_id || '?'));
    var status = STATUS_LABEL[it.status] || it.status || '';
    var type = TYPE_LABEL[it.request_type] || '';
    var votes = (typeof it.vote_count === 'number') ? ('  ♥' + it.vote_count) : '';
    lines.push((i + 1) + '. ' + title + '  [' + type + '·' + status + ']' + votes);
  }
  await ctx.ui.showDialog({
    title: '我的求片（' + list.length + '）',
    message: lines.join('\n'),
    buttons: [{ id: 'ok', label: '完成' }]
  });
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
    submitLabel: '保存并登录',
    cancelLabel: '取消'
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
