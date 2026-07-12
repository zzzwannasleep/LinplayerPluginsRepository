// UHDNow 线路测速插件
//
// 从线路列表里选一条线路测下载速度，全程进度可视化。对应官网 https://www.uhdnow.com/speed。
// 一次测一条（和官网一样），用列表选择器点选线路，进度面板实时显示速度。
//
// 接口（逆向自 www.uhdnow.com 前端 /speed，已实测端点存在）：
//   POST /api/v1/auth/login {username,password}          -> {ok, data:{token}}
//   GET  /api/v1/subscriptions/domains                   -> {ok, data:[{id,name,domain}]}
//   GET  /api/v1/subscriptions/domains/{id}/resolve      -> {ok, data:{domain: <线路基址>}}
//   POST {线路基址}/api/v1/speed-test/session {parent_domain_id,size_mib}
//        -> {ok, data:{session_id, report_token}}
//   GET  {线路基址}/api/v1/speed-test/download?size_mb=&session_id=  -> 测试字节流
//   POST /api/v1/speed-test/report {session_id,report_token,average_mbps,...}
//
// 依赖较新宿主：ctx.ui.showList / showProgress、ctx.http discardBody、空转看门狗（不再 30s 误杀）。
// Authorization 头用原始 token（非 Bearer）。

'use strict';

var API_BASE = 'https://www.uhdnow.com';
var UA = 'Mozilla/5.0';
var SIZE_OPTIONS = [32, 64, 100]; // MiB，对标官网 /speed（服务端只接受这几个值）

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
        { headers: { 'Content-Type': 'application/json', 'Origin': API_BASE, 'Referer': API_BASE + '/', 'User-Agent': UA } });
      var b = res.body;
      if (res.status === 200 && b && b.ok && b.data && b.data.token) {
        await ctx.storage.set('token', b.data.token);
        return { token: b.data.token };
      }
      if (res.status === 400 || res.status === 401 || (b && b.ok === false)) {
        return { error: 'AUTH', msg: (b && b.msg) ? b.msg : ('HTTP ' + res.status) };
      }
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

// ---------- HTTP ----------
function joinUrl(base, path) { return String(base).replace(/\/+$/, '') + path; }
function getHeader(res, name) {
  var h = res && res.headers; if (!h) return null;
  var lower = name.toLowerCase();
  for (var k in h) { if (k.toLowerCase() === lower) return h[k]; }
  return null;
}
// 对齐官网浏览器请求：除 Authorization 头外，同源 fetch 还会自动带 Authorization Cookie
// 与 Origin/Referer；dio 无浏览器禁用头限制，显式补齐以避免部分接口 500。
function authHeaders(token) {
  return {
    'Authorization': token, 'Cookie': 'Authorization=' + token,
    'Origin': API_BASE, 'Referer': API_BASE + '/', 'User-Agent': UA
  };
}
function authGet(url, token, discard) {
  var o = { headers: authHeaders(token) };
  if (discard) o.discardBody = true;
  return ctx.http.get(url, o);
}
function authPost(url, body, token) {
  var h = authHeaders(token);
  h['Content-Type'] = 'application/json';
  return ctx.http.post(url, body, { headers: h });
}
async function fetchLines(token) {
  var res = await authGet(API_BASE + '/api/v1/subscriptions/domains', token);
  var b = res.body;
  if (res.status === 200 && b && b.ok && Array.isArray(b.data)) return b.data;
  if (res.status === 401) return null;
  return [];
}
function fmt(n) { return (Math.round(n * 10) / 10).toFixed(1); }

// ---------- 入口：开始测速 ----------
async function openSpeedTest() {
  var t = await ensureToken();
  if (!t.token) {
    if (t.error === 'NO_CREDS') { if (!(await openAccount())) return; t = await ensureToken(); }
    if (!t.token) {
      ctx.ui.showToast(t.error === 'AUTH' ? ('账号或密码错误：' + (t.msg || '')) : '登录失败，请检查账号或网络');
      return;
    }
  }
  var token = t.token;

  var lines = await fetchLines(token);
  if (lines === null) {
    await ctx.storage.delete('token');
    var r = await login();
    if (!r.token) { ctx.ui.showToast('获取线路失败，请稍后再试'); return; }
    token = r.token;
    lines = await fetchLines(token) || [];
  }
  if (!lines.length) { ctx.ui.showToast('没有可用线路'); return; }

  // 从列表选一条线路（只显示线路名称，不暴露线路地址）
  var lineId = await ctx.ui.showList({
    title: '选择测速线路',
    items: lines.map(function (l) {
      return { id: String(l.id), title: l.name || ('线路#' + l.id) };
    }),
    cancelLabel: '取消'
  });
  if (!lineId) return;
  var line = null;
  for (var i = 0; i < lines.length; i++) { if (String(lines[i].id) === String(lineId)) { line = lines[i]; break; } }
  if (!line) return;

  // 选测试大小（对标官网 32/64/100）
  var sizeChoice = await ctx.ui.showDialog({
    title: '测试大小（对标官网）',
    message: '选择本次下载量，越大越准但越费流量。',
    buttons: SIZE_OPTIONS.map(function (s) { return { id: String(s), label: s + ' MiB' }; })
      .concat([{ id: 'cancel', label: '取消' }])
  });
  if (!sizeChoice || sizeChoice === 'cancel') return;
  var sizeMib = SIZE_OPTIONS.indexOf(Number(sizeChoice)) >= 0 ? Number(sizeChoice) : 32;

  await runTest(line, sizeMib, token);
}

// ---------- 单线路测速（进度可视化）----------
async function runTest(line, sizeMib, token) {
  var name = line.name || line.domain || ('线路#' + line.id);
  var pid = await ctx.ui.showProgress({ title: '测速 · ' + name, message: '正在解析线路…', percent: 3 });
  function fail(msg) { ctx.ui.closeProgress(pid); ctx.ui.showToast(msg); }

  var rr;
  try { rr = await authGet(API_BASE + '/api/v1/subscriptions/domains/' + encodeURIComponent(line.id) + '/resolve', token); }
  catch (e) { return fail('线路解析失败'); }
  var rb = rr.body;
  if (!(rr.status === 200 && rb && rb.ok && rb.data && rb.data.domain)) return fail('线路解析失败：' + ((rb && rb.msg) || rr.status));
  var base = rb.data.domain;

  // 建测速会话：size_mib 必须是官网允许值(32/64/100),下载 size_mb 必须与之相同——
  // 服务端会校验,不匹配就 "参数验证失败" 或只回几十字节。故单会话单次下载,不分段。
  await ctx.ui.updateProgress(pid, { message: '建立测速会话…', percent: 22 });
  var sr;
  try { sr = await authPost(joinUrl(base, '/api/v1/speed-test/session'), { parent_domain_id: line.id, size_mib: sizeMib }, token); }
  catch (e) { return fail(/白名单/.test(String(e)) ? '线路域名未授权（请反馈开发者）' : '建立会话失败'); }
  var sb = sr.body;
  if (sr.status === 403) return fail('线路不可用或流量不足');
  if (!(sr.status === 200 && sb && sb.ok && sb.data && sb.data.session_id && sb.data.report_token)) {
    return fail('建立会话失败：' + ((sb && sb.msg) || sr.status));
  }
  var sess = sb.data;

  // 下载测速：单次请求下载整份(discardBody 按流丢弃只计字节,不占插件内存)。
  // 单请求内拿不到实时进度,故这段用不定态进度条表示"正在测速"。
  await ctx.ui.updateProgress(pid, { message: '下载测速中（' + sizeMib + ' MiB），请稍候…' });
  var dlUrl = joinUrl(base, '/api/v1/speed-test/download') +
    '?size_mb=' + sizeMib + '&session_id=' + encodeURIComponent(sess.session_id);
  var t0 = Date.now();
  var dr;
  try { dr = await authGet(dlUrl, token, true); }
  catch (e) { return fail('下载测速失败'); }
  var ms = Date.now() - t0;
  if (dr.status === 403) return fail('流量不足');
  if (dr.status !== 200) return fail('下载测速失败（HTTP ' + dr.status + '）');
  if (ms <= 0) ms = 1;

  var bytes = (typeof dr.bytes === 'number' && dr.bytes > 0) ? dr.bytes
    : (Number(getHeader(dr, 'content-length')) || (sizeMib * 1024 * 1024));
  var secs = ms / 1000;
  var avg = bytes * 8 / secs / 1e6;        // Mbps
  var mBs = bytes / secs / 1048576;        // MB/s

  // 上报（尽力而为）
  try {
    await authPost(API_BASE + '/api/v1/speed-test/report', {
      session_id: sess.session_id, report_token: sess.report_token,
      average_mbps: Number(avg.toFixed(3)), peak_mbps: Number(avg.toFixed(3)),
      elapsed_ms: Math.round(ms), sample_count: 1, server_downloaded_bytes: bytes
    }, token);
  } catch (e) { /* ignore */ }

  await ctx.ui.updateProgress(pid, { percent: 100, message: '完成' });
  await ctx.sleep(150);
  ctx.ui.closeProgress(pid);

  await ctx.ui.showDialog({
    title: '测速结果 · ' + name,
    message: '平均速度：' + fmt(avg) + ' Mbps（' + fmt(mBs) + ' MB/s）\n' +
      '测试大小：' + sizeMib + ' MiB\n用时：' + fmt(secs) + ' 秒\n\n注：客户端粗测，仅供参考。',
    buttons: [{ id: 'ok', label: '完成' }]
  });
}

// ---------- 账号设置 ----------
async function openAccount() {
  var info = {};
  try { info = (await ctx.emby.getServerInfo()) || {}; } catch (e) { /* 可无 */ }
  var u = (await ctx.storage.get('site_username')) || (info.username || '');

  var values = await ctx.ui.showForm({
    title: 'UHDNow 测速 · 账号',
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
  if (r.token) { ctx.ui.showToast('登录成功，可到「开始测速」运行'); return true; }
  if (r.error === 'AUTH') { ctx.ui.showToast('账号或密码错误：' + (r.msg || '')); return false; }
  if (r.error === 'NO_CREDS') { ctx.ui.showToast('请填写账号和密码'); return false; }
  ctx.ui.showToast('登录失败（网络问题），稍后可重试'); return false;
}

ctx.onEnable(function () { ctx.log.info('UHDNow 线路测速已启用'); });
ctx.onDisable(function () { ctx.log.info('UHDNow 线路测速已禁用'); });
