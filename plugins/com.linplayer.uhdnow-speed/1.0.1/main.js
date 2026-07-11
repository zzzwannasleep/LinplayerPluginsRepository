// UHDNow 线路测速插件
//
// 一站式测试 UHDNow 各条线路的下载速度。对应官网 https://www.uhdnow.com/speed。
// 逐条线路 -> 解析真实域名 -> 建测速会话 -> 下载测试文件测速 -> 上报，按速度排序展示。
//
// 测试文件大小对标官网：32 / 64 / 100 MiB（在「账号设置」里选，默认 32）。
// 下载走 ctx.http 的 discardBody（按流丢弃、只计字节数），因此大文件也不会撑爆插件内存。
//
// 登录：在「账号设置」填 uhdnow 网站账号密码；也会回退到添加服务器时的 Emby 账密。
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
// Authorization 头用原始 token（非 Bearer）。

'use strict';

var API_BASE = 'https://www.uhdnow.com';
var UA = 'Mozilla/5.0';
var SIZE_OPTIONS = [32, 64, 100]; // MiB，对标官网 /speed
var DEFAULT_SIZE_MIB = 32;

// ---------- 登录 ----------
async function getCreds() {
  var u = await ctx.storage.get('site_username');
  var p = await ctx.storage.get('site_password');
  if (u && p) return { username: u, password: p };
  try {
    var c = (await ctx.emby.getCredentials()) || {};
    if (c.username && c.password) return { username: c.username, password: c.password };
  } catch (e) { /* 无 emby.credentials 权限或未存密码 */ }
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

// ---------- HTTP 小工具 ----------
function joinUrl(base, path) { return String(base).replace(/\/+$/, '') + path; }

function getHeader(res, name) {
  var h = res && res.headers;
  if (!h) return null;
  var lower = name.toLowerCase();
  for (var k in h) { if (k.toLowerCase() === lower) return h[k]; }
  return null;
}

function authGet(url, token, opts) {
  var o = { headers: { 'Authorization': token, 'User-Agent': UA } };
  if (opts && opts.discardBody) o.discardBody = true;
  return ctx.http.get(url, o);
}

function authPost(url, body, token) {
  return ctx.http.post(url, body, {
    headers: { 'Content-Type': 'application/json', 'Authorization': token, 'User-Agent': UA }
  });
}

function normSize(v) {
  var n = Math.round(Number(v) || 0);
  return SIZE_OPTIONS.indexOf(n) >= 0 ? n : DEFAULT_SIZE_MIB;
}

// ---------- 测速核心 ----------
async function fetchLines(token) {
  var res = await authGet(API_BASE + '/api/v1/subscriptions/domains', token);
  var b = res.body;
  if (res.status === 200 && b && b.ok && Array.isArray(b.data)) return b.data;
  if (res.status === 401) return null; // 触发上层重登
  return [];
}

// 测一条线路。返回 { name, mbps, mbytesPerSec } 或 { name, error }。
async function testLine(line, token, sizeMib) {
  var name = line.name || line.domain || ('线路#' + line.id);

  // ① 解析真实线路基址
  var rr;
  try {
    rr = await authGet(API_BASE + '/api/v1/subscriptions/domains/' +
      encodeURIComponent(line.id) + '/resolve', token);
  } catch (e) { return { name: name, error: '解析失败' }; }
  var rb = rr.body;
  if (!(rr.status === 200 && rb && rb.ok && rb.data && rb.data.domain)) {
    return { name: name, error: '解析失败' };
  }
  var base = rb.data.domain;

  // ② 建测速会话
  var sr;
  try {
    sr = await authPost(joinUrl(base, '/api/v1/speed-test/session'),
      { parent_domain_id: line.id, size_mib: sizeMib }, token);
  } catch (e) {
    // 线路域名不在白名单时会抛异常 —— 明确提示，便于反馈补白名单
    return { name: name, error: /白名单/.test(String(e)) ? '域名未授权' : '不可用' };
  }
  var sb = sr.body;
  if (sr.status === 403) return { name: name, error: '不可用' };
  if (!(sr.status === 200 && sb && sb.ok && sb.data && sb.data.session_id && sb.data.report_token)) {
    return { name: name, error: (sb && sb.msg) ? sb.msg : '会话失败' };
  }
  var sess = sb.data;

  // ③ 下载测试文件并计时（discardBody：只计字节数，不占插件内存）
  var dlUrl = joinUrl(base, '/api/v1/speed-test/download') +
    '?size_mb=' + sizeMib + '&session_id=' + encodeURIComponent(sess.session_id);
  var t0 = Date.now();
  var dr;
  try {
    dr = await authGet(dlUrl, token, { discardBody: true });
  } catch (e) { return { name: name, error: '下载失败' }; }
  var elapsedMs = Date.now() - t0;
  if (dr.status === 403) return { name: name, error: '流量不足' };
  if (dr.status !== 200) return { name: name, error: '下载失败' };
  if (elapsedMs <= 0) elapsedMs = 1;

  // 新宿主返回 bytes（真实下载字节数）；旧宿主没有则退回 Content-Length / 预期大小
  var bytes = (typeof dr.bytes === 'number' && dr.bytes > 0)
    ? dr.bytes
    : (Number(getHeader(dr, 'content-length')) || (sizeMib * 1024 * 1024));
  var secs = elapsedMs / 1000;
  var mbytesPerSec = bytes / secs / (1024 * 1024);   // MB/s（1024 进制）
  var mbps = (bytes * 8) / secs / 1e6;               // Mbps（十进制，与官网口径一致）

  // ④ 上报（尽力而为）
  try {
    await authPost(API_BASE + '/api/v1/speed-test/report', {
      session_id: sess.session_id,
      report_token: sess.report_token,
      average_mbps: Number(mbps.toFixed(3)),
      peak_mbps: Number(mbps.toFixed(3)),
      elapsed_ms: Math.round(elapsedMs),
      sample_count: 1,
      server_downloaded_bytes: bytes
    }, token);
  } catch (e) { /* 上报失败无所谓 */ }

  return { name: name, mbps: mbps, mbytesPerSec: mbytesPerSec };
}

// ---------- 入口：开始测速 ----------
async function openSpeedTest() {
  var t = await ensureToken();
  if (!t.token) {
    if (t.error === 'NO_CREDS') {
      var ok = await openAccount();
      if (!ok) return;
      t = await ensureToken();
    }
    if (!t.token) {
      ctx.ui.showToast(t.error === 'AUTH' ? ('账号或密码错误：' + (t.msg || '')) : '登录失败，请检查账号或网络');
      return;
    }
  }
  var token = t.token;
  var sizeMib = normSize(await ctx.storage.get('size_mib'));

  var lines = await fetchLines(token);
  if (lines === null) { // token 过期，重登一次
    await ctx.storage.delete('token');
    var r = await login();
    if (!r.token) { ctx.ui.showToast('获取线路失败，请稍后再试'); return; }
    token = r.token;
    lines = await fetchLines(token) || [];
  }
  if (!lines.length) { ctx.ui.showToast('没有可用线路'); return; }

  var confirm = await ctx.ui.showDialog({
    title: 'UHDNow 线路测速',
    message: '将逐条测试 ' + lines.length + ' 条线路，每条下载 ' + sizeMib +
      ' MiB 测试文件（共约 ' + (lines.length * sizeMib) + ' MiB），会消耗账户流量。是否继续？',
    buttons: [{ id: 'go', label: '开始' }, { id: 'cancel', label: '取消' }]
  });
  if (confirm !== 'go') return;

  ctx.ui.showToast('测速中，请稍候…（' + lines.length + ' 条线路）');
  var results = [];
  for (var i = 0; i < lines.length; i++) {
    results.push(await testLine(lines[i], token, sizeMib));
  }

  var ok2 = results.filter(function (r) { return typeof r.mbps === 'number'; })
    .sort(function (a, b) { return b.mbps - a.mbps; });
  var bad = results.filter(function (r) { return typeof r.mbps !== 'number'; });

  var out = [];
  for (var j = 0; j < ok2.length; j++) {
    var r2 = ok2[j];
    out.push((j + 1) + '. ' + r2.name + '  ' +
      r2.mbps.toFixed(1) + ' Mbps (' + r2.mbytesPerSec.toFixed(1) + ' MB/s)');
  }
  for (var k = 0; k < bad.length; k++) {
    out.push('— ' + bad[k].name + '  ' + bad[k].error);
  }

  await ctx.ui.showDialog({
    title: '测速结果 · ' + sizeMib + ' MiB（越靠前越快）',
    message: out.join('\n') + '\n\n注：结果为客户端粗测，仅供参考。',
    buttons: [{ id: 'ok', label: '完成' }]
  });
}

// ---------- 账号设置 ----------
async function openAccount() {
  var info = {};
  try { info = (await ctx.emby.getServerInfo()) || {}; } catch (e) { /* 可无 */ }
  var u = (await ctx.storage.get('site_username')) || (info.username || '');
  var size = normSize(await ctx.storage.get('size_mib'));

  var values = await ctx.ui.showForm({
    title: 'UHDNow 测速 · 账号',
    fields: [
      { key: 'username', label: '网站用户名', type: 'text', default: u,
        hint: 'uhdnow 网站登录账号（可能与 Emby 不同）' },
      { key: 'password', label: '网站密码', type: 'password', default: '' },
      { key: 'size', label: '测试文件大小(MiB)', type: 'number', default: size,
        hint: '对标官网，可填 32 / 64 / 100（默认 32）；越大越准但越费流量' }
    ],
    submitLabel: '保存',
    cancelLabel: '取消'
  });
  if (!values) return false;

  var un = (values.username || '').trim();
  var pw = (values.password || '').trim();
  if (un) await ctx.storage.set('site_username', un);
  if (pw) await ctx.storage.set('site_password', pw);
  await ctx.storage.set('size_mib', normSize(values.size));
  await ctx.storage.delete('token');

  var r = await login();
  if (r.token) { ctx.ui.showToast('登录成功，可到「开始测速」运行'); return true; }
  if (r.error === 'AUTH') { ctx.ui.showToast('账号或密码错误：' + (r.msg || '')); return false; }
  if (r.error === 'NO_CREDS') { ctx.ui.showToast('请填写账号和密码'); return false; }
  ctx.ui.showToast('登录失败（网络问题），稍后可重试'); return false;
}

ctx.onEnable(function () { ctx.log.info('UHDNow 线路测速已启用'); });
ctx.onDisable(function () { ctx.log.info('UHDNow 线路测速已禁用'); });
