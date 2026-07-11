// UHDNow 求片插件
//
// 搜索后弹出【带海报的结果列表】点选影视，填说明提交求片 / 追新；查看「我的求片」「全部求片」
// （带海报），为热门求片投票。对应官网 https://www.uhdnow.com/user/help/media-requests。
//
// 提交时「说明」为必填（官网同样必填），留空会被服务端拒“参数验证失败”。
//
// 依赖较新宿主：ctx.ui.showList（带缩略图的列表选择器）、select 表单字段、ctx.http.delete、
// 空转看门狗（交互流程不再 30s 误杀）。海报由宿主直接加载 image.tmdb.org（不走插件白名单）。
//
// 接口（逆向自 www.uhdnow.com 前端）：
//   POST /api/v1/auth/login {username,password}          -> {ok, data:{token}}
//   POST /api/v1/media-requests/search {keyword,request_type,page,page_size}
//        -> {ok, data:{list:[{tmdb_id,media_type,title,original_title,year,poster_path,
//                             backdrop_path,overview,library_media_id}]}}
//   POST /api/v1/media-requests {request_type,media_type,tmdb_id,title,...,content(必填)}
//   POST /api/v1/media-requests/mine/list {page,page_size}
//   POST /api/v1/media-requests/list      {page,page_size}
//   POST|DELETE /api/v1/media-requests/{id}/vote
//
// request_type：missing=求片 / refresh=追新。Authorization 头用原始 token（非 Bearer）。

'use strict';

var API_BASE = 'https://www.uhdnow.com';
var TMDB_IMG = 'https://image.tmdb.org/t/p/w200';
var UA = 'Mozilla/5.0';
var STATUS_LABEL = {
  pending: '待处理', processing: '处理中', deferred: '已暂缓', rejected: '未通过', completed: '已完成'
};
var TYPE_LABEL = { missing: '求片', refresh: '追新' };
function mediaTypeLabel(t) { return t === 'movie' ? '电影' : (t === 'tv' ? '剧集' : (t || '')); }
function posterUrl(p) { return p ? (TMDB_IMG + p) : ''; }

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
      var res = await ctx.http.post(API_BASE + '/api/v1/auth/login',
        { username: creds.username, password: creds.password },
        { headers: { 'Content-Type': 'application/json', 'User-Agent': UA } });
      var b = res.body;
      if (res.status === 200 && b && b.ok && b.data && b.data.token) {
        await ctx.storage.set('token', b.data.token);
        return { token: b.data.token };
      }
      if (res.status === 400 || res.status === 401 || (b && b.ok === false)) {
        return { error: 'AUTH', msg: (b && b.msg) ? b.msg : ('HTTP ' + res.status) };
      }
      ctx.log.warn('登录返回 ' + res.status);
    } catch (e) { ctx.log.warn('登录网络异常，重试: ' + e); }
    if (i < 2) await ctx.sleep(400 * (i + 1));
  }
  return { error: 'NETWORK' };
}

async function ensureToken() {
  var token = await ctx.storage.get('token');
  if (token) return { token: token };
  return login();
}

// ---------- 统一请求（401 重登 + 日志 + 错误分类）----------
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
      var em = String(e);
      ctx.log.warn(method + ' ' + path + ' 异常: ' + em);
      if (/白名单|重定向/.test(em)) return { error: 'WHITELIST', msg: em };
      return { error: 'NETWORK', msg: em };
    }
    var rb = res.body;
    if (res.status === 200 && rb && rb.ok) return { body: rb };
    if (res.status === 401 || (rb && rb.msg && /登录|重新登录|token/i.test(rb.msg))) {
      await ctx.storage.delete('token');
      var r = await login();
      if (!r.token) return r;
      token = r.token; continue;
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
    message: '搜索提交求片 / 追新，查看我的求片与全部求片，给热门求片投票。',
    buttons: [
      { id: 'search', label: '搜索求片' },
      { id: 'mine', label: '我的求片' },
      { id: 'all', label: '全部求片' },
      { id: 'cancel', label: '取消' }
    ]
  });
  if (choice === 'search') await doSearch();
  else if (choice === 'mine') await doList('/api/v1/media-requests/mine/list', '我的求片', false);
  else if (choice === 'all') await doList('/api/v1/media-requests/list', '全部求片', true);
}

// ---------- 搜索并提交 ----------
async function doSearch() {
  var f1 = await ctx.ui.showForm({
    title: '搜索求片',
    fields: [
      { key: 'keyword', label: '影视名称', type: 'text', default: '', hint: '支持中/英文、原名' },
      { key: 'type', label: '类型', type: 'select',
        options: [{ value: 'missing', label: '求片（片库没有）' }, { value: 'refresh', label: '追新（已有内容求更新）' }],
        default: 'missing' }
    ],
    submitLabel: '搜索', cancelLabel: '取消'
  });
  if (!f1) return;
  var keyword = (f1.keyword || '').trim();
  if (!keyword) { ctx.ui.showToast('请输入影视名称'); return; }
  var requestType = (f1.type === 'refresh') ? 'refresh' : 'missing';

  ctx.ui.showToast('搜索中…');
  var r = await apiReq('post', '/api/v1/media-requests/search',
    { keyword: keyword, request_type: requestType, page: 1, page_size: 12 });
  if (r.error) { ctx.ui.showToast('搜索失败：' + errText(r)); return; }
  var list = pickList(r.body).slice(0, 20);
  if (!list.length) { ctx.ui.showToast('没有找到「' + keyword + '」'); return; }

  // 带海报的结果列表，点选一条
  var idxStr = await ctx.ui.showList({
    title: '选择要' + TYPE_LABEL[requestType] + '的影视',
    items: list.map(function (it, i) {
      var sub = [];
      if (it.year) sub.push(String(it.year));
      sub.push(mediaTypeLabel(it.media_type));
      if (it.original_title && it.original_title !== it.title) sub.push(it.original_title);
      return {
        id: String(i),
        title: it.title || it.original_title || ('tmdb#' + it.tmdb_id),
        subtitle: sub.join(' · '),
        image: posterUrl(it.poster_path)
      };
    }),
    cancelLabel: '取消'
  });
  if (idxStr === null || idxStr === undefined || idxStr === '') return;
  var pick = list[Number(idxStr)] || list[0];

  // 说明必填，留空则循环重填
  var content = '';
  while (true) {
    var f2 = await ctx.ui.showForm({
      title: '提交' + TYPE_LABEL[requestType] + '：' + (pick.title || ''),
      fields: [{ key: 'content', label: '说明（必填）', type: 'text', default: content,
        hint: '本次处理说明，如版本 / 分辨率 / 集数等诉求' }],
      submitLabel: '提交', cancelLabel: '取消'
    });
    if (!f2) return;
    content = (f2.content || '').trim();
    if (!content) { ctx.ui.showToast('「说明」为必填，请填写后再提交'); continue; }
    break;
  }

  var bodyReq = {
    request_type: requestType,
    media_type: pick.media_type,
    tmdb_id: Number(pick.tmdb_id != null ? pick.tmdb_id : pick.id),
    title: pick.title,
    original_title: pick.original_title,
    year: pick.year,
    poster_path: pick.poster_path,
    backdrop_path: pick.backdrop_path,
    overview: pick.overview,
    content: content
  };
  if (pick.library_media_id != null) bodyReq.library_media_id = pick.library_media_id;

  var cr = await apiReq('post', '/api/v1/media-requests', bodyReq);
  if (cr.error) { ctx.ui.showToast('提交失败：' + errText(cr)); return; }
  ctx.ui.showToast((pick.title || '') + ' ' + TYPE_LABEL[requestType] + '已提交');
}

// ---------- 列表（我的 / 全部）。带海报；全部支持投票。----------
async function doList(path, title, votable) {
  ctx.ui.showToast('加载中…');
  var r = await apiReq('post', path, { page: 1, page_size: 20 });
  if (r.error) { ctx.ui.showToast('加载失败：' + errText(r)); return; }
  var list = pickList(r.body);
  if (!list.length) {
    await ctx.ui.showDialog({ title: title, message: '暂无数据。', buttons: [{ id: 'ok', label: '完成' }] });
    return;
  }

  var idxStr = await ctx.ui.showList({
    title: title + (votable ? '（点选可投票）' : ''),
    items: list.map(function (it, i) {
      var m = it.media || it;
      var nm = m.title || m.original_title || ('tmdb#' + (m.tmdb_id || it.tmdb_id || '?'));
      var status = STATUS_LABEL[it.status] || it.status || '';
      var type = TYPE_LABEL[it.request_type] || '';
      var votes = (typeof it.vote_count === 'number') ? ('  ♥' + it.vote_count) : '';
      var mine = it.voted_by_me ? ' ✓已投' : '';
      return {
        id: String(i),
        title: nm + votes,
        subtitle: type + ' · ' + status + mine,
        image: posterUrl(m.poster_path)
      };
    }),
    cancelLabel: '完成'
  });
  if (idxStr === null || idxStr === undefined || idxStr === '') return;
  var it = list[Number(idxStr)];
  if (!it) return;

  if (!votable) {
    // 我的求片：点选看详情
    var m2 = it.media || it;
    var nm2 = m2.title || m2.original_title || ('tmdb#' + (m2.tmdb_id || it.tmdb_id || '?'));
    await ctx.ui.showDialog({
      title: nm2,
      message: '类型：' + (TYPE_LABEL[it.request_type] || '') + '\n' +
        '状态：' + (STATUS_LABEL[it.status] || it.status || '') + '\n' +
        (typeof it.vote_count === 'number' ? ('票数：' + it.vote_count + '\n') : '') +
        (it.content ? ('说明：' + it.content) : ''),
      buttons: [{ id: 'ok', label: '完成' }]
    });
    return;
  }

  // 全部求片：点选后投票 / 取消
  var voted = !!it.voted_by_me;
  var confirm = await ctx.ui.showDialog({
    title: (it.media || it).title || '求片',
    message: voted ? '你已为它投票，是否取消投票？' : '为这条求片投票支持？',
    buttons: [{ id: 'go', label: voted ? '取消投票' : '投票' }, { id: 'cancel', label: '返回' }]
  });
  if (confirm !== 'go') return;
  var votePath = '/api/v1/media-requests/' + encodeURIComponent(it.id) + '/vote';
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
