'use strict';
//
// M3U 直播源 —— 三个函数就是一个完整数据源。
//
//   listDir(dirId, server)                 浏览
//   search(query, server)                  搜索
//   resolvePlay(entry, qualityId, server)   给出真正能播的地址
//
// 写完这三个，浏览页 / 搜索 / 播放 / 续播 / 收藏全都是白拿的，
// 不用新增任何页面、任何命令。
//
// ── 关于出网白名单 ────────────────────────────────────────────────
// manifest 里只写了一个 `$sourceServer`。它在运行时展开成**用户自己在「添加服务器」
// 里填的那个地址的 origin** —— 因为通用插件在发布时根本不可能知道用户的播放列表放在哪。
// 它同时也是唯一允许明文 http 的路径（用户填了 http:// 才放行）。
//
// 注意：频道的播放地址通常在**别的**域名上，但那些地址是宿主的播放器直接去取的，
// 不经过 ctx.http，所以不受这份白名单限制。插件只负责把地址交出去。
//

var CACHE_TTL_MS = 5 * 60 * 1000;
var cache = null; // { url, at, groups: [{name, items:[entry]}], all: [entry] }

/** 把一行 #EXTINF 的属性抠出来。形如：#EXTINF:-1 tvg-logo="x" group-title="央视",CCTV-1 */
function parseExtInf(line) {
  var comma = line.indexOf(',');
  var head = comma >= 0 ? line.slice(0, comma) : line;
  var name = comma >= 0 ? line.slice(comma + 1).trim() : '';
  var attrs = {};
  var re = /([A-Za-z0-9_-]+)="([^"]*)"/g;
  var m;
  while ((m = re.exec(head)) !== null) attrs[m[1].toLowerCase()] = m[2];
  return { name: name, attrs: attrs };
}

function parsePlaylist(text) {
  var lines = String(text || '').split(/\r?\n/);
  var groups = {};
  var all = [];
  var pending = null;
  var seq = 0;

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;
    if (line.charAt(0) === '#') {
      if (line.indexOf('#EXTINF:') === 0) pending = parseExtInf(line.slice(8));
      // 其余 #EXTM3U / #EXTVLCOPT / #EXTGRP 等一律忽略
      continue;
    }
    // 非 # 开头 = 一条播放地址
    if (!/^https?:\/\//i.test(line)) { pending = null; continue; }

    var info = pending || { name: '', attrs: {} };
    pending = null;
    var group = (info.attrs['group-title'] || '未分组').trim() || '未分组';
    var name = info.name || info.attrs['tvg-name'] || line;
    seq += 1;

    var entry = {
      // id 要稳定且唯一：同名频道在很多列表里出现多次（不同线路）。
      id: 'ch/' + seq,
      name: name,
      // ★ 直播地址常常没有扩展名（.m3u8 之外还有一堆），宿主的扩展名表认不出来。
      //   不显式写 isVideo:true 的话，这些频道会被当成普通文件、根本不给播。
      isVideo: true,
      thumb: info.attrs['tvg-logo'] || undefined,
      raw: { u: line, g: group }
    };
    all.push(entry);
    (groups[group] = groups[group] || []).push(entry);
  }

  var names = Object.keys(groups).sort();
  return {
    all: all,
    groups: names.map(function (n) { return { name: n, items: groups[n] }; })
  };
}

async function load(server) {
  var url = (server && server.baseUrl) || '';
  if (!url) throw new Error('还没填播放列表地址');

  var now = Date.now();
  if (cache && cache.url === url && now - cache.at < CACHE_TTL_MS) return cache;

  var res = await ctx.http.get(url, { headers: { Accept: '*/*' } });
  if (res.status < 200 || res.status >= 300) {
    throw new Error('拉取播放列表失败：HTTP ' + res.status);
  }
  // 不是 JSON 的响应，ctx.http 原样给字符串。
  var text = typeof res.body === 'string' ? res.body : JSON.stringify(res.body);
  if (text.indexOf('#EXTINF') < 0 && text.indexOf('#EXTM3U') < 0) {
    throw new Error('这个地址返回的不像 m3u 播放列表');
  }

  var parsed = parsePlaylist(text);
  if (parsed.all.length === 0) throw new Error('播放列表里一个频道都没有');
  cache = { url: url, at: now, all: parsed.all, groups: parsed.groups };
  ctx.log.info('播放列表已解析：' + parsed.all.length + ' 个频道 / ' + parsed.groups.length + ' 个分组');
  return cache;
}

function groupDir(g) {
  return { id: 'g/' + g.name, name: g.name + '（' + g.items.length + '）', isDir: true };
}

async function listDir(dirId, server) {
  var data = await load(server);

  if (!dirId) {
    // 根目录：分组列表。只有一个分组时没必要多点一层，直接给频道。
    if (data.groups.length <= 1) return data.all;
    return data.groups.map(groupDir);
  }

  if (dirId.indexOf('g/') === 0) {
    var want = dirId.slice(2);
    for (var i = 0; i < data.groups.length; i++) {
      if (data.groups[i].name === want) return data.groups[i].items;
    }
    return [];
  }
  return [];
}

async function search(query, server) {
  var q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  var data = await load(server);
  return data.all.filter(function (e) {
    return e.name.toLowerCase().indexOf(q) >= 0 || e.raw.g.toLowerCase().indexOf(q) >= 0;
  });
}

async function resolvePlay(entry, qualityId, server) {
  var url = entry && entry.raw && entry.raw.u;
  if (!url) {
    // 缓存过期后条目的 raw 还在（宿主原样带回来的），一般走不到这里；
    // 真走到了就按 id 回列表里找一遍。
    var data = await load(server);
    for (var i = 0; i < data.all.length; i++) {
      if (data.all[i].id === entry.id) { url = data.all[i].raw.u; break; }
    }
  }
  if (!url) throw new Error('找不到这个频道的播放地址，试试退回上一层刷新');

  return {
    url: url,
    title: entry.name,
    // 有些源要求带 Referer 才给流。没有就不要瞎加。
    httpHeaders: {}
  };
}

ctx.onEnable(async function () {
  await ctx.sources.register('playlist', {
    listDir: listDir,
    search: search,
    resolvePlay: resolvePlay
  });
  ctx.log.info('M3U 直播源已就绪');
});

ctx.onDisable(async function () {
  cache = null;
  await ctx.sources.unregister('playlist');
});
