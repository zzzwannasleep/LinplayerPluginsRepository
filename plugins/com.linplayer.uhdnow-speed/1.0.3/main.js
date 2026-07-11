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
var SIZE_OPTIONS = [32, 64, 100]; // MiB，对标官网 /speed
var CHUNK_MIB = 8;                // 每段大小，用于驱动进度条

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
function authGet(url, token, discard) {
  var o = { headers: { 'Authorization': token, 'User-Agent': UA } };
  if (discard) o.discardBody = true;
  return ctx.http.get(url, o);
}
function authPost(url, body, token) {
  return ctx.http.post(url, body, {
    headers: { 'Content-Type': 'application/json', 'Authorization': token, 'User-Agent': UA }
  });
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

  // 从列表选一条线路
  var lineId = await ctx.ui.showList({
    title: '选择测速线路',
    items: lines.map(function (l) {
      return { id: String(l.id), title: l.name || l.domain || ('线路#' + l.id), subtitle: l.domain || '' };
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

  var nChunks = Math.max(1, Math.ceil(sizeMib / CHUNK_MIB));
  var totalBytes = 0, totalMs = 0, peak = 0, lastSess = null;

  for (var i = 0; i < nChunks; i++) {
    var chunk = Math.min(CHUNK_MIB, sizeMib - i * CHUNK_MIB);
    if (chunk <= 0) break;

    await ctx.ui.updateProgress(pid, {
      percent: 8 + Math.round(87 * (i / nChunks)),
      message: '测速中（第 ' + (i + 1) + '/' + nChunks + ' 段）…' +
        (totalBytes > 0 ? ('\n平均 ' + fmt(totalBytes * 8 / (totalMs / 1000) / 1e6) + ' Mbps') : '')
    });

    var sr;
    try { sr = await authPost(joinUrl(base, '/api/v1/speed-test/session'), { parent_domain_id: line.id, size_mib: chunk }, token); }
    catch (e) { return fail(/白名单/.test(String(e)) ? '线路域名未授权（请反馈开发者）' : '建立会话失败'); }
    var sb = sr.body;
    if (sr.status === 403) return fail('线路不可用或流量不足');
    if (!(sr.status === 200 && sb && sb.ok && sb.data && sb.data.session_id && sb.data.report_token)) {
      return fail('建立会话失败：' + ((sb && sb.msg) || sr.status));
    }
    lastSess = sb.data;

    var dlUrl = joinUrl(base, '/api/v1/speed-test/download') +
      '?size_mb=' + chunk + '&session_id=' + encodeURIComponent(lastSess.session_id);
    var t0 = Date.now();
    var dr;
    try { dr = await authGet(dlUrl, token, true); }
    catch (e) { return fail('下载测速失败'); }
    var ms = Date.now() - t0;
    if (dr.status === 403) return fail('流量不足');
    if (dr.status !== 200) return fail('下载测速失败（HTTP ' + dr.status + '）');
    if (ms <= 0) ms = 1;

    var bytes = (typeof dr.bytes === 'number' && dr.bytes > 0) ? dr.bytes
      : (Number(getHeader(dr, 'content-length')) || (chunk * 1024 * 1024));
    var curMbps = bytes * 8 / (ms / 1000) / 1e6;
    totalBytes += bytes; totalMs += ms;
    if (curMbps > peak) peak = curMbps;
    var avgMbps = totalBytes * 8 / (totalMs / 1000) / 1e6;

    await ctx.ui.updateProgress(pid, {
      percent: 8 + Math.round(87 * ((i + 1) / nChunks)),
      message: '已测 ' + fmt(totalBytes / 1048576) + ' / ' + sizeMib + ' MiB\n' +
        '当前 ' + fmt(curMbps) + ' Mbps\n平均 ' + fmt(avgMbps) + ' Mbps'
    });
  }

  var avg = totalBytes * 8 / (totalMs / 1000) / 1e6;
  var mBs = totalBytes / (totalMs / 1000) / 1048576;

  if (lastSess) {
    try {
      await authPost(API_BASE + '/api/v1/speed-test/report', {
        session_id: lastSess.session_id, report_token: lastSess.report_token,
        average_mbps: Number(avg.toFixed(3)), peak_mbps: Number(peak.toFixed(3)),
        elapsed_ms: Math.round(totalMs), sample_count: nChunks, server_downloaded_bytes: totalBytes
      }, token);
    } catch (e) { /* ignore */ }
  }

  await ctx.ui.updateProgress(pid, { percent: 100, message: '完成' });
  await ctx.sleep(200);
  ctx.ui.closeProgress(pid);

  await ctx.ui.showDialog({
    title: '测速结果 · ' + name,
    message: '平均速度：' + fmt(avg) + ' Mbps（' + fmt(mBs) + ' MB/s）\n' +
      '峰值速度：' + fmt(peak) + ' Mbps\n测试大小：' + sizeMib + ' MiB\n\n注：客户端粗测，仅供参考。',
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
