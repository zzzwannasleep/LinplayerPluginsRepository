'use strict';
//
// UHDNow 助手 —— 求片 / 测速 / 流量三合一。
//
// v1 时代这是三个各自独立的插件，于是同一套网站账密要填三遍、存三份。
// v2 合成一个：账号只在「设置 → UHDNow 账号」填一次，三块功能共用。
//
// ── 账号为什么要自己收 ────────────────────────────────────────────
// v1 用的是 emby.credentials 权限，直接问宿主要用户的登录密码。v2 把这个权限
// 整个删掉了：宿主不再持久化明文密码，插件想要账密就自己弹表单、自己存
// （ctx.storage 每个插件独立）。顺带也更准确 —— UHDNow 的网站账号本来就
// 可能和 Emby 账号不是一个。
//
// 接口逆向自 www.uhdnow.com 前端，均已实测。
//   POST /api/v1/auth/login                          -> {ok, data:{token}}
//   GET  /api/v1/traffic/me                          -> {ok, data:{used_bytes, limit_bytes}}
//   POST /api/v1/media-requests/search               {keyword, request_type, page, page_size}
//   POST /api/v1/media-requests                      {request_type, media_type, tmdb_id, title, content}
//   POST /api/v1/media-requests/mine/list | /list     {page, page_size}
//   POST|DELETE /api/v1/media-requests/{id}/vote
//   GET  /api/v1/subscriptions/domains               -> [{id,name,domain}]
//   GET  /api/v1/subscriptions/domains/{id}/resolve  -> {data:{domain}}
//   POST {线路}/api/v1/speed-test/session            {parent_domain_id, size_mib}
//   GET  {线路}/api/v1/speed-test/download?size_mb=&session_id=
//   POST /api/v1/speed-test/report
//

var API = 'https://www.uhdnow.com';
// ★ 必须显式给 UA。宿主的 http 客户端默认**一个头都不发**，很多站（尤其挂 CF 的）
//   会直接 403，而报错长得像「登录失败」，能查半天。
var UA = 'Mozilla/5.0 (LinPlayer UHDNow Plugin)';
var GiB = 1073741824;

var hub = { view: 'home', items: [], msg: '' };

// ── 登录与请求 ──────────────────────────────────────────────────────
function baseHeaders() {
  return {
    'Content-Type': 'application/json',
    'Origin': API,
    'Referer': API + '/',
    'User-Agent': UA
  };
}

async function creds() {
  var u = await ctx.storage.get('username');
  var p = await ctx.storage.get('password');
  return (u && p) ? { username: u, password: p } : null;
}

/** 登录换 token。返回 {token} 或 {error, msg}。 */
async function login() {
  var c = await creds();
  if (!c) return { error: 'NO_CREDS' };

  for (var i = 0; i < 3; i++) {
    try {
      var res = await ctx.http.post(API + '/api/v1/auth/login', c, { headers: baseHeaders() });
      var b = res.body;
      if (res.status === 200 && b && b.ok && b.data && b.data.token) {
        await ctx.storage.set('token', b.data.token);
        return { token: b.data.token };
      }
      // 账密错就别重试了，重试三次只是让用户多等
      if (res.status === 400 || res.status === 401 || (b && b.ok === false)) {
        return { error: 'AUTH', msg: (b && b.msg) ? b.msg : ('HTTP ' + res.status) };
      }
    } catch (e) {
      ctx.log.warn('登录网络异常，第 ' + (i + 1) + ' 次：' + e);
    }
    if (i < 2) await ctx.sleep(400 * (i + 1));
  }
  return { error: 'NETWORK' };
}

async function token() {
  var t = await ctx.storage.get('token');
  if (t) return { token: t };
  return login();
}

/** 带鉴权的请求；401 自动重登一次。 */
async function api(method, path, body, absBase) {
  var t = await token();
  if (!t.token) return t;

  for (var round = 0; round < 2; round++) {
    var h = baseHeaders();
    h['Authorization'] = t.token;
    h['Cookie'] = 'Authorization=' + t.token;
    var url = (absBase || API) + path;
    var res;
    try {
      if (method === 'get') res = await ctx.http.get(url, { headers: h });
      else if (method === 'delete') res = await ctx.http.delete(url, { headers: h, body: body || {} });
      else res = await ctx.http.post(url, body || {}, { headers: h });
    } catch (e) {
      return { error: 'NETWORK', msg: String(e) };
    }

    var b = res.body;
    if (res.status === 200 && b && b.ok) return { data: b.data };
    if (res.status === 401 && round === 0) {
      await ctx.storage.delete('token');
      var re = await login();
      if (!re.token) return re;
      t = re;
      continue;
    }
    return { error: 'HTTP', msg: (b && b.msg) ? b.msg : ('HTTP ' + res.status) };
  }
  return { error: 'NETWORK' };
}

function why(r) {
  switch (r.error) {
    case 'NO_CREDS': return '请先在「设置 → UHDNow 账号」里填网站账号密码';
    case 'AUTH': return '账号或密码不对' + (r.msg ? '：' + r.msg : '');
    case 'NETWORK': return '网络不通，稍后再试';
    default: return r.msg || '请求失败';
  }
}

// ── 首页：剩余流量 ──────────────────────────────────────────────────
async function renderTraffic() {
  // 只在当前服务器确实是 UHDNow 时才占首页的位置。
  var info = (await ctx.emby.getServerInfo()) || {};
  var hay = ((info.url || '') + ' ' + (info.baseUrl || '') + ' ' + (info.name || '')).toLowerCase();
  if (hay.indexOf('uhdnow') < 0) return null;

  var r = await api('get', '/api/v1/traffic/me');
  if (!r.data) {
    return { t: 'stat', label: '流量', value: '—', hint: why(r) };
  }
  var used = (Number(r.data.used_bytes) || 0) / GiB;
  var limit = (Number(r.data.limit_bytes) || 0) / GiB;
  var left = Math.max(0, limit - used);
  return {
    t: 'row',
    children: [
      { t: 'stat', label: '剩余流量', value: left.toFixed(1) + ' GB' },
      { t: 'stat', label: '总流量', value: limit.toFixed(0) + ' GB' }
    ]
  };
}

// ── 侧栏：求片 / 测速 ───────────────────────────────────────────────
var STATUS = { pending: '待处理', approved: '已通过', rejected: '已拒绝', done: '已入库', completed: '已入库' };
var TYPE = { missing: '求片', refresh: '追新' };

function homeView() {
  return {
    t: 'col',
    children: [
      // 页头已经写了插件名，这里不再重复一遍。
      hub.msg ? { t: 'badge', text: hub.msg, tone: 'info' } : { t: 'divider' },
      { t: 'list', items: [
        { id: 'search', title: '求片 / 追新', subtitle: '搜片名，选中后提交申请', handler: 'go' },
        { id: 'mine', title: '我的求片', subtitle: '看自己提过的申请进度', handler: 'go' },
        { id: 'all', title: '全部求片', subtitle: '给别人的申请投票', handler: 'go' },
        { id: 'speed', title: '线路测速', subtitle: '会消耗账户流量', handler: 'go' }
      ] }
    ]
  };
}

function listView(title, votable) {
  var kids = [
    { t: 'row', children: [
      { t: 'button', label: '← 返回', handler: 'go' },
      { t: 'text', text: title, variant: 'title' }
    ] }
  ];
  if (hub.msg) kids.push({ t: 'badge', text: hub.msg, tone: 'warn' });
  if (!hub.items.length) {
    kids.push({ t: 'text', text: '这里还什么都没有。', variant: 'hint' });
  } else {
    kids.push({ t: 'list', items: hub.items.map(function (it) {
      return {
        id: String(it.id),
        title: it.title,
        subtitle: it.sub,
        handler: votable ? 'vote' : undefined
      };
    }) });
    if (votable) kids.push({ t: 'text', text: '点某一条 = 投票 / 取消投票。', variant: 'hint' });
  }
  return { t: 'col', children: kids };
}

function searchView() {
  return {
    t: 'col',
    children: [
      { t: 'row', children: [
        { t: 'button', label: '← 返回', handler: 'go' },
        { t: 'text', text: '求片 / 追新', variant: 'title' }
      ] },
      { t: 'input', id: 'keyword', label: '片名', placeholder: '中文名或原名都行' },
      { t: 'select', id: 'type', label: '类型', value: 'missing', options: [
        { value: 'missing', label: '求片（库里没有）' },
        { value: 'refresh', label: '追新（求更新）' }
      ] },
      { t: 'input', id: 'content', label: '说明', multiline: true,
        placeholder: '想要的版本、字幕、分辨率…（必填）' },
      { t: 'row', children: [
        { t: 'button', label: '搜索并提交', handler: 'search', variant: 'primary' }
      ] },
      hub.msg ? { t: 'badge', text: hub.msg, tone: 'info' } : { t: 'divider' }
    ]
  };
}

function speedView() {
  return {
    t: 'col',
    children: [
      { t: 'row', children: [
        { t: 'button', label: '← 返回', handler: 'go' },
        { t: 'text', text: '线路测速', variant: 'title' }
      ] },
      { t: 'text', text: '测速会真的下载数据，消耗你账户的流量。', variant: 'hint' },
      { t: 'select', id: 'size', label: '测试大小', value: '32', options: [
        { value: '32', label: '32 MiB' },
        { value: '64', label: '64 MiB' },
        { value: '100', label: '100 MiB' }
      ] },
      { t: 'row', children: [
        { t: 'button', label: '选线路并开始', handler: 'speed', variant: 'primary' }
      ] },
      hub.msg ? { t: 'badge', text: hub.msg, tone: 'good' } : { t: 'divider' }
    ]
  };
}

function renderHub() {
  switch (hub.view) {
    case 'search': return searchView();
    case 'mine': return listView('我的求片', false);
    case 'all': return listView('全部求片', true);
    case 'speed': return speedView();
    default: return homeView();
  }
}

/** 列表项 -> 展示行。 */
function rowOf(it) {
  var m = it.media || {};
  var name = m.title || m.original_title || ('tmdb#' + (m.tmdb_id || it.tmdb_id || '?'));
  var bits = [];
  if (TYPE[it.request_type]) bits.push(TYPE[it.request_type]);
  if (STATUS[it.status]) bits.push(STATUS[it.status]);
  if (typeof it.vote_count === 'number') bits.push('♥ ' + it.vote_count + (it.voted_by_me ? '（已投）' : ''));
  return { id: it.id, title: name, sub: bits.join(' · ') };
}

function pickList(d) {
  if (Array.isArray(d)) return d;
  if (d && Array.isArray(d.list)) return d.list;
  if (d && Array.isArray(d.items)) return d.items;
  if (d && Array.isArray(d.records)) return d.records;
  return [];
}

async function hubGo(v) {
  var to = (v && v.itemId) || 'home';
  hub.msg = '';
  hub.items = [];
  hub.view = to;

  if (to === 'mine' || to === 'all') {
    var path = to === 'mine' ? '/api/v1/media-requests/mine/list' : '/api/v1/media-requests/list';
    var r = await api('post', path, { page: 1, page_size: 20 });
    if (!r.data) { hub.msg = why(r); return null; }
    hub.items = pickList(r.data).map(rowOf);
  }
  return null;
}

async function doSearch(v) {
  v = v || {};
  var keyword = String(v.keyword || '').trim();
  var content = String(v.content || '').trim();
  if (!keyword) { hub.msg = '先写个片名'; return null; }
  if (!content) { hub.msg = '说明是必填的，写一句想要什么版本'; return null; }
  var type = v.type === 'refresh' ? 'refresh' : 'missing';

  var r = await api('post', '/api/v1/media-requests/search',
    { keyword: keyword, request_type: type, page: 1, page_size: 10 });
  if (!r.data) { hub.msg = why(r); return null; }

  var list = pickList(r.data);
  if (!list.length) { hub.msg = '没搜到「' + keyword + '」'; return null; }

  var picked = await ctx.ui.showList({
    title: '选一个提交',
    items: list.map(function (it, i) {
      var year = (it.release_date || it.first_air_date || '').slice(0, 4);
      return {
        id: String(i),
        title: (it.title || it.name || it.original_title || '未知') + (year ? '（' + year + '）' : ''),
        subtitle: (it.media_type === 'tv' ? '剧集' : '电影') +
                  (it.in_library ? ' · 已在库' : '') +
                  (it.overview ? ' · ' + String(it.overview).slice(0, 40) : '')
      };
    })
  });
  if (picked === null || picked === undefined) return null;

  var m = list[Number(picked)];
  if (!m) return null;

  var cr = await api('post', '/api/v1/media-requests', {
    request_type: type,
    media_type: m.media_type || 'movie',
    tmdb_id: m.tmdb_id || m.id,
    title: m.title || m.name || m.original_title,
    content: content
  });
  hub.msg = cr.data ? '已提交，去「我的求片」看进度' : why(cr);
  return null;
}

async function doVote(v) {
  var id = v && v.itemId;
  if (!id) return null;
  var row = null;
  for (var i = 0; i < hub.items.length; i++) if (String(hub.items[i].id) === String(id)) row = hub.items[i];
  var voted = row && row.sub && row.sub.indexOf('已投') >= 0;

  var path = '/api/v1/media-requests/' + encodeURIComponent(id) + '/vote';
  var r = voted ? await api('delete', path) : await api('post', path, {});
  if (!r.data && r.error) { hub.msg = why(r); return null; }
  hub.msg = voted ? '已取消投票' : '已投票';
  // 重新拉一遍列表，票数才是真的
  return hubGo({ itemId: hub.view });
}

async function doSpeed(v) {
  var sizeMib = Number((v && v.size) || 32) || 32;

  var lines = await api('get', '/api/v1/subscriptions/domains');
  if (!lines.data) { hub.msg = why(lines); return null; }
  var list = pickList(lines.data);
  if (!list.length) { hub.msg = '账号下没有可测的线路'; return null; }

  var pick = await ctx.ui.showList({
    title: '选一条线路',
    items: list.map(function (l) { return { id: String(l.id), title: l.name || l.domain || ('线路 ' + l.id) }; })
  });
  if (!pick) return null;
  var line = null;
  for (var i = 0; i < list.length; i++) if (String(list[i].id) === String(pick)) line = list[i];
  if (!line) return null;

  await ctx.ui.showProgress({ title: '正在测速（' + sizeMib + ' MiB）' });
  try {
    var rr = await api('get', '/api/v1/subscriptions/domains/' + encodeURIComponent(line.id) + '/resolve');
    if (!rr.data || !rr.data.domain) { hub.msg = why(rr); return null; }
    var base = String(rr.data.domain).replace(/\/+$/, '');
    if (base.indexOf('http') !== 0) base = 'https://' + base;

    var sr = await api('post', '/api/v1/speed-test/session',
      { parent_domain_id: line.id, size_mib: sizeMib }, base);
    if (!sr.data) { hub.msg = why(sr); return null; }
    var sid = sr.data.session_id || sr.data.id;
    var reportToken = sr.data.report_token;

    var t = await token();
    var url = base + '/api/v1/speed-test/download?size_mb=' + sizeMib + '&session_id=' + encodeURIComponent(sid);
    var began = Date.now();
    // ★ discardBody：按流丢弃只数字节，内存恒定。不加的话 100 MiB 会被整个读成
    //   一个字符串塞进 JS 里 —— 那是插件引擎的内存上限，直接崩。
    var dl = await ctx.http.get(url, {
      headers: { 'Authorization': t.token, 'User-Agent': UA, 'Referer': API + '/' },
      discardBody: true
    });
    var secs = Math.max(0.001, (Date.now() - began) / 1000);
    var bytes = Number(dl.bytes) || 0;
    var mbps = (bytes * 8) / secs / 1e6;

    if (reportToken) {
      await api('post', '/api/v1/speed-test/report',
        { session_id: sid, report_token: reportToken, average_mbps: Number(mbps.toFixed(2)) });
    }
    hub.msg = (line.name || '线路') + '：' + mbps.toFixed(1) + ' Mbps（' +
              (bytes / 1048576).toFixed(0) + ' MiB / ' + secs.toFixed(1) + ' 秒）';
  } catch (e) {
    hub.msg = '测速失败：' + e;
  } finally {
    ctx.ui.closeProgress();
  }
  return null;
}

// ── 设置：账号 ──────────────────────────────────────────────────────
async function renderAccount() {
  var u = (await ctx.storage.get('username')) || '';
  var has = !!(await ctx.storage.get('password'));
  return {
    t: 'col',
    children: [
      { t: 'text', text: '填 UHDNow **网站**账号（和 Emby 账号可能不是一个）。', variant: 'hint' },
      { t: 'input', id: 'username', label: '网站用户名', value: u },
      { t: 'input', id: 'password', label: '网站密码', password: true,
        placeholder: has ? '已保存，留空则不改' : '' },
      { t: 'row', children: [
        { t: 'button', label: '保存并登录', handler: 'save', variant: 'primary' }
      ] },
      { t: 'text', text: '账密只存在这个插件自己的本地存储里，别的插件读不到。', variant: 'hint' }
    ]
  };
}

async function saveAccount(v) {
  v = v || {};
  var u = String(v.username || '').trim();
  var p = String(v.password || '').trim();
  if (u) await ctx.storage.set('username', u);
  // 留空 = 不改密码，别把已存的清掉
  if (p) await ctx.storage.set('password', p);
  await ctx.storage.delete('token');

  var r = await login();
  ctx.ui.showToast(r.token ? '登录成功' : why(r));
  return null;
}

ctx.onEnable(function () { ctx.log.info('UHDNow 助手已启用'); });
ctx.onDisable(function () { ctx.log.info('UHDNow 助手已停用'); });
