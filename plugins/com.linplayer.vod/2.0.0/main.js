'use strict';
//
// VOD 资源站 —— 影视资源站「采集接口」的目录适配。
//
// 这里说的采集接口指的是形如 `…/api.php/provide/vod/` 的那套 JSON 接口:绝大多数
// 资源站都在提供它,参数和字段名是一样的(ac / t / pg / wd,vod_name / vod_pic /
// vod_play_url …),所以一份适配能通吃。用户只需要填自己那个站的接口地址。
//
// ── v2:换成「影视目录」契约 ────────────────────────────────────────
// v1 实现的是 listDir/search/resolvePlay —— 那是**文件树**的契约,宿主拿它渲染
// 网盘文件页。资源站硬套文件树的代价是每一样东西都得伪装成文件:
//   分类 → 伪装成文件夹      翻页 → 伪装成一个叫「下一页」的文件夹
//   「更新至17集」→ 只能拼进文件名     打开 → 文件管理器的双击语义
// 全是错的。v2 改成宿主的影视目录契约,三个方法:
//
//   categories(server)                  分类树 → 顶部分类条
//   catalog({categoryId,keyword,page})  一页卡片 + hasMore → 无限下拉
//   mediaDetail(id, server)             简介/演职员/线路/分集 → 详情页
//   resolvePlay(entry, quality, server) 一集 → 可播地址(和 v1 一样,没动)
//
// **不再实现 listDir / search** —— 这个源不是文件树,不该假装是。
//
// ── 为什么只用 ac=detail,不用 ac=list ──────────────────────────────
// `ac=list` 返回的每条只有 8 个字段:**没有 vod_pic,也没有 vod_play_url**。
// 拿它当列表就必须「列 20 条 → 再打 20 次详情」才能出海报,慢且容易被站点限流。
// 实测(360zy / bfzy / lziapi 三站一致)`ac=detail` 同样吃 `t` 和 `pg`,
// 一次请求就给回 20 条 × 83 字段,海报、备注、年份、播放地址全在里面。
// 实测两者耗时几乎一样(0.83s vs 0.75s):瓶颈是 RTT 不是体积,换轻接口省不下来。
//
// ── 关于出网白名单 ─────────────────────────────────────────────────
// manifest 里只有 `$sourceServer`,运行时展开成**用户自己填的那个采集地址的 origin**。
// 一个服务器只能打它自己那个域名 —— 想用多个资源站,就在「服务器 › 添加」里加多个。
// 海报和 m3u8 在别的域名上,但那两样分别是界面和播放器直接去取的,不走 ctx.http。
//

// 宿主的 http 客户端默认一个头都不发,不少采集站(尤其挂 CF 的)会直接 403,
// 而报错看起来像鉴权失败。必须自己带 UA。
var UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

var CLASS_TTL_MS = 10 * 60 * 1000;
var PAGE_TTL_MS = 3 * 60 * 1000;
// 详情的顺手缓存:目录页已经把完整详情拿回来了,点进去就不用再打一次接口 ——
// 「点开慢」有一半是这一次多余的往返。丢了也能靠 ac=detail&ids= 补,所以满了整个扔掉。
var ITEM_CACHE_MAX = 800;

var sites = {}; // { [server.id]: { classes, classesAt, items, pages } }

function slot(server) {
  var k = (server && (server.id || server.baseUrl)) || '-';
  if (!sites[k]) sites[k] = { classes: null, classesAt: 0, items: {}, pages: {} };
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

// ── 解析 ────────────────────────────────────────────────────────────

/**
 * 看起来是不是能直接喂给播放器的媒体地址。
 *
 * 有的站会在某条线路里放**网页播放页**而不是流:lziapi 的 `liangzi` 线路给的是
 * `/share/<hash>`,GET 回来是 `<!doctype html>`;同一部片的 `lzm3u8` 线路才是真
 * `.m3u8`。两条线路并排列出来的话,用户有一半概率点到黑屏。
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

function str(v) {
  var s = v === undefined || v === null ? '' : String(v).trim();
  return s || null;
}

/** 年份/评分里的 0 是「没有」,不是数值,不该显示出来。 */
function num(v) {
  var s = str(v);
  if (!s) return null;
  return Number(s) > 0 ? s : null;
}

function poster(item) {
  var pic = String((item && item.vod_pic) || '').trim();
  return /^https?:\/\//i.test(pic) ? pic : null;
}

/** 一条影片 → 目录里的一张卡。**每样东西一个字段**,不再往标题里拼。 */
function toCard(item, s) {
  var id = String(item.vod_id);
  if (Object.keys(s.items).length > ITEM_CACHE_MAX) s.items = {};
  s.items[id] = item;

  var lines = playLines(item);
  var total = 0;
  for (var i = 0; i < lines.length; i++) total = Math.max(total, lines[i].eps.length);

  return {
    id: id,
    title: str(item.vod_name) || id,
    poster: poster(item),
    badge: str(item.vod_remarks), // 「更新至17集」——角标,不是标题的一部分
    year: num(item.vod_year),
    score: num(item.vod_score),
    isSeries: total > 1
  };
}

// ── 三个方法 ────────────────────────────────────────────────────────

async function categories(server) {
  var s = slot(server);
  if (s.classes && Date.now() - s.classesAt < CLASS_TTL_MS) return s.classes;

  var d = await api(server, { ac: 'class' });
  var arr = (d && d['class']) || [];
  var flat = [];
  for (var i = 0; i < arr.length; i++) {
    var c = arr[i];
    var id = Number(c && c.type_id);
    var name = String((c && c.type_name) || '').trim();
    if (!id || !name) continue;
    // ★ 有的站的 class 只有 type_id + type_name,**没有 type_pid**(wujinapi 就是)。
    //   Number(undefined) 是 NaN,`|| 0` 会把整棵树压平成一层 —— 那正是我们想要的
    //   降级行为:猜不出父子关系时,老老实实全铺在第一级,别编一个假层级出来。
    flat.push({ id: String(id), pid: Number(c.type_pid) || 0, name: name });
  }

  var byId = {};
  for (var j = 0; j < flat.length; j++) byId[flat[j].id] = { id: flat[j].id, name: flat[j].name, children: [] };

  var tree = [];
  for (var k = 0; k < flat.length; k++) {
    var node = byId[flat[k].id];
    var parent = flat[k].pid ? byId[String(flat[k].pid)] : null;
    if (parent) parent.children.push(node);
    else tree.push(node);
  }

  s.classes = tree;
  s.classesAt = Date.now();
  return tree;
}

async function catalog(req, server) {
  var s = slot(server);
  var categoryId = (req && req.categoryId) || '';
  var keyword = String((req && req.keyword) || '').trim();
  var page = Math.max(1, Number(req && req.page) || 1);

  // 往回翻(用户点了返回再进来)不该再等一次网络。
  // 用 JSON 拼键:关键词里可能有任何字符,自己挑一个分隔符迟早撞上。
  var ck = JSON.stringify([categoryId, keyword, page]);
  var hit = s.pages[ck];
  if (hit && Date.now() - hit.at < PAGE_TTL_MS) return hit.val;

  // 搜索只有 ac=detail&wd= 好使。ac=list&wd= 会**返回全站内容**,看起来像搜到了
  // 一堆,其实一条都没匹配 —— 这个坑很安静,别改。
  var q = { ac: 'detail', pg: page };
  if (keyword) q.wd = keyword;
  else if (categoryId) q.t = categoryId;

  var d = await api(server, q);
  var list = (d && d.list) || [];
  var items = [];
  for (var i = 0; i < list.length; i++) {
    if (list[i] && list[i].vod_id) items.push(toCard(list[i], s));
  }

  var pagecount = Number(d && d.pagecount) || 0;
  var val = {
    items: items,
    // pagecount 缺失时退回「这一页满 20 条就可能还有」——比直接说没有更接近真相。
    hasMore: pagecount ? page < pagecount : items.length >= 20,
    total: Number(d && d.total) || undefined
  };
  s.pages[ck] = { at: Date.now(), val: val };
  return val;
}

async function mediaDetail(id, server) {
  var s = slot(server);
  var item = s.items[id];
  if (!item) {
    var d = await api(server, { ac: 'detail', ids: id });
    item = ((d && d.list) || [])[0];
    if (!item) throw new Error('这条资源没了,站点可能已经下架');
    s.items[id] = item;
  }

  var lines = playLines(item).map(function (l, li) {
    return {
      id: String(li),
      name: l.name,
      episodes: l.eps.map(function (e, ei) {
        return { id: 'p|' + id + '|' + li + '|' + ei, name: e.name, raw: { u: e.url } };
      })
    };
  });

  return {
    id: String(id),
    title: str(item.vod_name) || String(id),
    poster: poster(item),
    badge: str(item.vod_remarks),
    year: num(item.vod_year),
    area: str(item.vod_area),
    lang: str(item.vod_lang),
    genre: str(item.vod_class) || str(item.type_name),
    score: num(item.vod_score),
    // vod_content 是带 HTML 标签的,宿主按纯文本渲染,这里先剥干净。
    overview: str(String(item.vod_content || item.vod_blurb || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ')),
    actors: str(item.vod_actor),
    director: str(item.vod_director),
    lines: lines
  };
}

async function resolvePlay(entry, qualityId, server) {
  var url = entry && entry.raw && entry.raw.u;

  if (!url) {
    // raw 一般会被宿主原样带回来。真丢了就按 id 里的坐标回站上取。
    var a = String((entry && entry.id) || '').split('|');
    if (a[0] === 'p' && a[1]) {
      var s = slot(server);
      var item = s.items[a[1]];
      if (!item) {
        var d = await api(server, { ac: 'detail', ids: a[1] });
        item = ((d && d.list) || [])[0];
        if (item) s.items[a[1]] = item;
      }
      var lines = item ? playLines(item) : [];
      var li = Number(a[2]) || 0;
      var ei = Number(a[3]) || 0;
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
    // 影视目录三件套。**故意不实现 listDir / search** —— 这个源不是文件树,
    // 不该假装是;宿主探到 categories 能用就会走影视浏览页。
    categories: categories,
    catalog: catalog,
    mediaDetail: mediaDetail,
    resolvePlay: resolvePlay
  });
  ctx.log.info('VOD 资源站已就绪');
});

ctx.onDisable(async function () {
  sites = {};
  await ctx.sources.unregister('site');
});
