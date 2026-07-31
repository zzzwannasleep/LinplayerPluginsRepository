'use strict';
//
// VOD 资源站 —— 影视资源站「采集接口」的浏览适配。
//
// 这里说的采集接口指的是形如 `…/api.php/provide/vod/` 的那套 JSON 接口:绝大多数
// 资源站都在提供它,参数和字段名是一样的(ac / t / pg / wd,vod_name / vod_pic /
// vod_play_url …),所以一份适配能通吃。用户只需要填自己那个站的接口地址。
//
// 三个函数就是一个完整数据源:
//   listDir(dirId, server)                  浏览
//   search(query, server)                   搜索
//   resolvePlay(entry, qualityId, server)   给出真正能播的地址
//
// ── 为什么只用 ac=detail,不用 ac=list ──────────────────────────────
// `ac=list` 返回的每条只有 8 个字段:**没有 vod_pic,也没有 vod_play_url**。
// 拿它当列表就必须「列 20 条 → 再打 20 次详情」才能出海报,慢且容易被站点限流。
// 实测(360zy / bfzy / lziapi 三站一致)`ac=detail` 同样吃 `t` 和 `pg`,
// 一次请求就给回 20 条 × 83 字段,海报和播放地址全在里面。
// 所以整个插件只有两种请求:一次 `ac=class` 拿分类树,之后全是 `ac=detail`。
//
// ── 虚拟路径 ───────────────────────────────────────────────────────
// 宿主只给 `listDir` 一个字符串 dirId,所以「分类 → 影片 → 线路 → 分集」四层
// 全折进这个字符串里(Stremio 源同款做法,零新页面零新命令)。
//
//   null                根目录 = 一个「按分类浏览」入口 + 最新内容第 1 页
//   k                   分类总览:顶级分类列表
//   c|<类型id>|<页>     某分类第 N 页(类型id 可空 = 全站);第 1 页附带子分类目录
//   v|<影片id>          影片:多线路时列线路,单线路直接列分集
//   v|<影片id>|<线路>   某条线路的分集
//   s|<页>|<关键词>     搜索结果第 N 页(关键词放最后,它自己可能含 |)
//   p|<影片id>[|线路|集] 可播条目
//
// ── 关于出网白名单 ─────────────────────────────────────────────────
// manifest 里只有 `$sourceServer`,运行时展开成**用户自己填的那个采集地址的 origin**。
// 一个服务器只能打它自己那个域名 —— 想用多个资源站,就在「服务器 › 添加」里加多个,
// 每个站一条。这不是限制凑合出来的,是白名单模型本来的样子:放行谁由用户决定,不由插件决定。
//
// 海报和 m3u8 在别的域名上,但那两样分别是 webview 和播放器直接去取的,不走 ctx.http,
// 因此不受这份白名单约束。插件只负责把地址交出去。
//

// 宿主的 http 客户端默认一个头都不发,不少采集站(尤其挂 CF 的)会直接 403,
// 而报错看起来像鉴权失败。必须自己带 UA。
var UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

var CLASS_TTL_MS = 10 * 60 * 1000;
// 影片详情的顺手缓存:列表页已经把完整详情拿回来了,点进分集时就不用再打一次接口。
// 只是省一次请求,丢了也能靠 ac=detail&ids= 补回来,所以满了直接整个扔掉,不做 LRU。
var ITEM_CACHE_MAX = 600;

var sites = {}; // { [server.id]: { classes, classesAt, items } }

function slot(server) {
  var k = (server && (server.id || server.baseUrl)) || '-';
  if (!sites[k]) sites[k] = { classes: null, classesAt: 0, items: {} };
  return sites[k];
}

// ── 接口 ────────────────────────────────────────────────────────────

async function api(server, params) {
  var base = (server && server.baseUrl) || '';
  if (!base) throw new Error('还没填采集接口地址');

  var query = {};
  for (var k in params) {
    if (params[k] !== undefined && params[k] !== null && params[k] !== '') {
      query[k] = String(params[k]);
    }
  }

  var res = await ctx.http.get(base, {
    query: query,
    headers: { 'User-Agent': UA, Accept: 'application/json, text/plain, */*' }
  });

  if (res.status < 200 || res.status >= 300) {
    throw new Error('接口返回 HTTP ' + res.status + ',这个站可能挂了或者换地址了');
  }
  return parseBody(res.body);
}

/**
 * ctx.http 认出 JSON 会先解析好;认不出就原样给字符串。
 * 实测两种真实故障都会走到字符串分支,而且必须分开报:
 *   · 站点返回 HTML 错误页/CF 拦截页(wolongzyw 就是这样)
 *   · 站点把 JSON 截断了(wujinapi 出现过,响应在 9 万字符处断掉)
 * 混成一句「解析失败」的话,用户分不清是地址填错了还是站点这次抽风。
 */
function parseBody(body) {
  var data = body;
  if (typeof data === 'string') {
    var t = data.replace(/^﻿/, '').trim();
    if (t.charAt(0) !== '{' && t.charAt(0) !== '[') {
      throw new Error('这个地址返回的不是采集接口 JSON(拿到的是网页或错误页),确认一下地址是不是 …/api.php/provide/vod/');
    }
    try {
      data = JSON.parse(t);
    } catch (e) {
      throw new Error('接口返回的 JSON 不完整(站点这次抽风),退回上一层重试一下');
    }
  }
  if (!data || typeof data !== 'object') throw new Error('接口返回的内容看不懂');
  // 采集站正常恒 code:1。非 1 且没给 list 才算真失败 —— 有的站 code 缺省,不能一刀切。
  if (data.code !== undefined && Number(data.code) !== 1 && !data.list) {
    throw new Error('接口报错:' + (data.msg || 'code=' + data.code));
  }
  return data;
}

async function classes(server) {
  var s = slot(server);
  if (s.classes && Date.now() - s.classesAt < CLASS_TTL_MS) return s.classes;
  var d = await api(server, { ac: 'class' });
  var arr = (d && d['class']) || [];
  var out = [];
  for (var i = 0; i < arr.length; i++) {
    var c = arr[i];
    var id = Number(c && c.type_id);
    var name = String((c && c.type_name) || '').trim();
    if (!id || !name) continue;
    out.push({ id: id, pid: Number(c.type_pid) || 0, name: name });
  }
  s.classes = out;
  s.classesAt = Date.now();
  return out;
}

// ── 解析 ────────────────────────────────────────────────────────────

/**
 * 看起来是不是能直接喂给播放器的媒体地址。
 *
 * 有的站会在某条线路里放**网页播放页**而不是流:lziapi 的 `liangzi` 线路给的是
 * `/share/<hash>`,GET 回来是 `<!doctype html>`;同一部片的 `lzm3u8` 线路才是真
 * `.m3u8`。两条线路并排列出来的话,用户有一半概率点到黑屏的那条。
 *
 * 判据只能是扩展名 —— 逐条 HEAD 一遍太慢,而且很多站不认 HEAD。
 * 所以这个判断**只用来在同一部片的线路之间做取舍**,不用来单独否决谁:
 * 全部线路都认不出扩展名时(直播式无扩展名直链就是这样)一条都不丢。
 */
function looksPlayable(url) {
  return /\.(m3u8|mp4|flv|ts|mkv|avi|mov|m4v|webm)(\?|#|$)/i.test(String(url || ''));
}

/**
 * vod_play_from / vod_play_url 拆成线路。实测格式:
 *   vod_play_from: "liangzi$$$lzm3u8"          多线路用 $$$
 *   vod_play_url:  "第01集$URL#第02集$URL"      集名和地址用 $,集与集用 #
 * 两边的 $$$ 分组数实测 1:1 对齐(31 集 ↔ 31 集)。
 *
 * 只收 http(s) 地址:有的站在这里放的是播放页链接,要网页解析才能拿到流。
 * 把那种地址交给播放器,用户看到的是「点了报错」——不如根本不列出来。
 */
function playLines(item) {
  var froms = String((item && item.vod_play_from) || '').split('$$$');
  var groups = String((item && item.vod_play_url) || '').split('$$$');
  var lines = [];
  for (var i = 0; i < groups.length; i++) {
    var eps = [];
    var parts = groups[i].split('#');
    for (var j = 0; j < parts.length; j++) {
      var p = parts[j].trim();
      if (!p) continue;
      var cut = p.indexOf('$');
      // 少数站不给集名,整段就是地址。
      var nm = cut >= 0 ? p.slice(0, cut).trim() : '';
      var url = cut >= 0 ? p.slice(cut + 1).trim() : p;
      if (!/^https?:\/\//i.test(url)) continue;
      eps.push({ name: nm || '第' + (eps.length + 1) + '集', url: url });
    }
    if (eps.length) {
      lines.push({
        name: String(froms[i] || '线路' + (i + 1)).trim(),
        eps: eps,
        // 用第一集代表整条线路 —— 同一条线路里的地址形态实测是一致的。
        direct: looksPlayable(eps[0].url)
      });
    }
  }
  // 有能直接播的线路,就别把网页播放页那条摆出来。一条都认不出时全留着。
  var playable = lines.filter(function (l) {
    return l.direct;
  });
  return playable.length ? playable : lines;
}

/** 卡片上那行字。宿主的条目只有一个 name 字段,信息全靠它带。 */
function label(item) {
  var bits = [];
  var name = String((item && item.vod_name) || '').trim();
  var remark = String((item && item.vod_remarks) || '').trim();
  var year = String((item && item.vod_year) || '').trim();
  if (name) bits.push(name);
  if (remark) bits.push(remark);
  if (year && year !== '0') bits.push(year);
  return bits.join(' · ') || String((item && item.vod_id) || '未命名');
}

function poster(item) {
  var pic = String((item && item.vod_pic) || '').trim();
  return /^https?:\/\//i.test(pic) ? pic : undefined;
}

function pageEntry(id, pg, pagecount) {
  return { id: id, name: '下一页 ›（第 ' + pg + ' / ' + pagecount + ' 页）', isDir: true };
}

/** 一条影片 → 一个条目。电影直接可播,剧集是文件夹。 */
function itemEntry(item, s) {
  var id = String(item.vod_id);
  if (Object.keys(s.items).length > ITEM_CACHE_MAX) s.items = {};
  s.items[id] = item;

  var lines = playLines(item);
  // 只有一条线路一集 = 电影,没必要让用户再点一层。
  if (lines.length === 1 && lines[0].eps.length === 1) {
    return {
      id: 'p|' + id,
      name: label(item),
      isVideo: true,
      thumb: poster(item),
      raw: { u: lines[0].eps[0].url }
    };
  }
  return { id: 'v|' + id, name: label(item), isDir: true, thumb: poster(item) };
}

// ── 三个函数 ────────────────────────────────────────────────────────

/**
 * 分类页:子分类目录 + 本级内容 + 下一页。
 *
 * 为什么混排:实测顶级分类自己是空的(360zy 的 t=2「连续剧」total=0,bfzy 的 t=1 也是 0),
 * 内容只挂在叶子分类上;但 lziapi 的 t=2 又确实有 3 条。给顶级分类单独做个「全部」
 * 入口的话,前一种站点下点进去是空的。混排则两种站都对,还少一条代码路径。
 */
async function catalog(server, typeId, pg, root) {
  var s = slot(server);
  var out = [];

  if (root) {
    /* 根目录只放一个分类入口,不把七八个分类平铺进来。
       宿主的浏览页在过半条目带图时会铺成海报墙,分类是**没有图的目录**——平铺的话
       它们会各占一个海报位,变成一排 172×257 的空盒子,压在最新内容前面。真机上看过,
       很难看。分类是导航不是内容,收进一个入口里,根目录就是一面干净的海报墙。 */
    out.push({ id: 'k', name: '按分类浏览', isDir: true });
  } else if (pg <= 1) {
    var cls = await classes(server);
    var parent = typeId === '' ? 0 : Number(typeId);
    for (var i = 0; i < cls.length; i++) {
      if (cls[i].pid === parent) out.push({ id: 'c|' + cls[i].id + '|1', name: cls[i].name, isDir: true });
    }
  }

  var d = await api(server, { ac: 'detail', t: typeId, pg: pg });
  var list = (d && d.list) || [];
  for (var j = 0; j < list.length; j++) {
    if (list[j] && list[j].vod_id) out.push(itemEntry(list[j], s));
  }

  var pc = Number(d && d.pagecount) || 0;
  if (pg < pc) out.push(pageEntry('c|' + typeId + '|' + (pg + 1), pg + 1, pc));
  return out;
}

async function fetchItem(server, vodId) {
  var s = slot(server);
  if (s.items[vodId]) return s.items[vodId];
  var d = await api(server, { ac: 'detail', ids: vodId });
  var item = ((d && d.list) || [])[0];
  if (!item) throw new Error('这条资源没了,站点可能已经下架');
  s.items[vodId] = item;
  return item;
}

/** 影片页:lineIdx < 0 = 还没选线路。 */
async function detail(server, vodId, lineIdx) {
  var item = await fetchItem(server, vodId);
  var lines = playLines(item);
  if (!lines.length) return [];

  function eps(li) {
    return lines[li].eps.map(function (e, ei) {
      return { id: 'p|' + vodId + '|' + li + '|' + ei, name: e.name, isVideo: true, raw: { u: e.url } };
    });
  }

  if (lineIdx >= 0) return lines[lineIdx] ? eps(lineIdx) : [];
  if (lines.length === 1) return eps(0);

  // 多线路但每条都只有一集(电影的常见形态,比如 lziapi 恒给 liangzi + lzm3u8 两条):
  // 别让用户为了看一部电影点两层,直接把线路本身做成可播条目。
  var single = lines.every(function (l) {
    return l.eps.length === 1;
  });
  if (single) {
    return lines.map(function (l, li) {
      return { id: 'p|' + vodId + '|' + li + '|0', name: l.name, isVideo: true, raw: { u: l.eps[0].url } };
    });
  }

  return lines.map(function (l, li) {
    return { id: 'v|' + vodId + '|' + li, name: l.name + '（' + l.eps.length + ' 集）', isDir: true };
  });
}

async function doSearch(server, query, pg) {
  var q = String(query || '').trim();
  if (!q) return [];
  var s = slot(server);
  // 搜索只有 ac=detail&wd= 好使。ac=list&wd= 会**返回全站内容**,看起来像搜到了一堆,
  // 其实一条都没匹配 —— 这个坑很安静,别改。
  var d = await api(server, { ac: 'detail', wd: q, pg: pg });
  var list = (d && d.list) || [];
  var out = [];
  for (var i = 0; i < list.length; i++) {
    if (list[i] && list[i].vod_id) out.push(itemEntry(list[i], s));
  }
  var pc = Number(d && d.pagecount) || 0;
  if (pg < pc) out.push(pageEntry('s|' + (pg + 1) + '|' + q, pg + 1, pc));
  return out;
}

async function listDir(dirId, server) {
  if (!dirId) return await catalog(server, '', 1, true);

  var a = String(dirId).split('|');
  switch (a[0]) {
    case 'k': {
      var cls = await classes(server);
      return cls
        .filter(function (c) {
          return c.pid === 0;
        })
        .map(function (c) {
          return { id: 'c|' + c.id + '|1', name: c.name, isDir: true };
        });
    }
    case 'c':
      return await catalog(server, a[1] || '', Number(a[2]) || 1);
    case 'v':
      return await detail(server, a[1], a.length > 2 ? Number(a[2]) : -1);
    case 's':
      // 关键词自己可能含 |,放在最后整段拼回来。
      return await doSearch(server, a.slice(2).join('|'), Number(a[1]) || 1);
    default:
      return [];
  }
}

async function search(query, server) {
  return await doSearch(server, query, 1);
}

async function resolvePlay(entry, qualityId, server) {
  var url = entry && entry.raw && entry.raw.u;

  if (!url) {
    // raw 一般会被宿主原样带回来。真丢了(比如条目是从别处重放的)就按 id 里的坐标回站上取。
    var a = String((entry && entry.id) || '').split('|');
    if (a[0] === 'p' && a[1]) {
      var lines = playLines(await fetchItem(server, a[1]));
      var li = a.length > 2 ? Number(a[2]) : 0;
      var ei = a.length > 3 ? Number(a[3]) : 0;
      if (lines[li] && lines[li].eps[ei]) url = lines[li].eps[ei].url;
    }
  }
  if (!url) throw new Error('拿不到这一集的播放地址,退回上一层刷新再试');

  return {
    url: url,
    title: (entry && entry.name) || '',
    // 实测这些 CDN 不校验 Referer、也不 302;但空 UA 在部分 CDN 上会吃 403,所以带上。
    userAgent: UA,
    httpHeaders: {}
  };
}

ctx.onEnable(async function () {
  await ctx.sources.register('site', {
    listDir: listDir,
    search: search,
    resolvePlay: resolvePlay
  });
  ctx.log.info('VOD 资源站已就绪');
});

ctx.onDisable(async function () {
  sites = {};
  await ctx.sources.unregister('site');
});
