// com.linplayer.vod 的行为测试。
//
// 跑法:node tools/test_vod.mjs
//
// 夹具是从真实采集站录下来的响应,**只把主机名换成了 example.com**——分隔符、字段名、
// 字段类型(注意 limit 是字符串 "20")、空值形态全部逐字保留,因为被测的正是这些。
// 主机名不影响任何一条解析逻辑,而把一串真实采集站域名写进公开仓库是另一回事。
//
// 这个文件测的是插件对外的三个函数,不是内部辅助函数——内部怎么拆是实现细节,
// 换个写法测试不该跟着改。

import assert from 'node:assert/strict';
import fs from 'node:fs';

const SRC = fs.readFileSync(new URL('../plugins/com.linplayer.vod/1.0.0/main.js', import.meta.url), 'utf8');

/** 把 main.js 装进一个 ctx 桩里,拿到它注册的那三个函数。 */
function load(httpGet) {
  let reg = null;
  const ctx = {
    log: { info() {}, warn() {}, error() {} },
    http: { get: httpGet },
    sources: {
      register(id, obj) {
        reg = obj;
      },
      unregister() {}
    },
    onEnable(fn) {
      fn();
    },
    onDisable() {},
    errors: { unsupported: (m) => new Error('LP_UNSUPPORTED:' + (m || '')) }
  };
  // eslint-disable-next-line no-new-func
  new Function('ctx', SRC)(ctx);
  assert.ok(reg, 'main.js 没有注册数据源');
  return reg;
}

const SERVER = { id: 'https://example.com/api.php/provide/vod/', baseUrl: 'https://example.com/api.php/provide/vod/' };

// ── 夹具 ──────────────────────────────────────────────────────────────

const CLASS_LIST = [
  { type_id: 1, type_pid: 0, type_name: '电影' },
  { type_id: 2, type_pid: 0, type_name: '连续剧' },
  { type_id: 6, type_pid: 1, type_name: '动作片' },
  { type_id: 7, type_pid: 1, type_name: '喜剧片' },
  { type_id: 13, type_pid: 2, type_name: '国产剧' }
];

// 电影:单线路单集。
const MOVIE = {
  vod_id: 102595,
  type_id: 6,
  type_name: '动作片',
  vod_name: '蜘蛛侠：崭新之日',
  vod_pic: 'https://img.example.com/upload/vod/20260730-1/cf1cb7.webp',
  vod_remarks: 'TC',
  vod_year: '2026',
  vod_play_from: 'zy',
  vod_play_note: '',
  vod_play_url: 'TC$https://cdn.example.com/20260730/mCs9tOgt/index.m3u8'
};

// 剧集:单线路多集。
const SERIES = {
  vod_id: 95052,
  type_id: 40,
  type_name: '日韩动漫',
  vod_name: '神之水滴',
  vod_pic: 'https://img.example.com/upload/vod/20260411-1/e99bfa.webp',
  vod_remarks: '更新至17集',
  vod_year: '2026',
  vod_play_from: 'zy',
  vod_play_url:
    '第01集$https://cdn.example.com/20260411/kADulDP9/index.m3u8' +
    '#第02集$https://cdn.example.com/20260417/hzD8npUa/index.m3u8' +
    '#第03集$https://cdn.example.com/20260424/tAmtdmcH/index.m3u8'
};

// 多线路多集($$$ 两边 1:1 对齐,实测就是这样)。
const MULTILINE_SERIES = {
  vod_id: 88001,
  vod_name: '双线剧',
  vod_pic: 'https://img.example.com/a.webp',
  vod_remarks: '全2集',
  vod_year: '2025',
  vod_play_from: 'liangzi$$$lzm3u8',
  vod_play_note: '$$$',
  vod_play_url:
    '第01集$https://a.example.com/1.m3u8#第02集$https://a.example.com/2.m3u8' +
    '$$$' +
    '第01集$https://b.example.com/1.m3u8#第02集$https://b.example.com/2.m3u8'
};

// 多线路但每条只有一集 = 电影的常见形态。
const MULTILINE_MOVIE = {
  vod_id: 88002,
  vod_name: '双线电影',
  vod_pic: 'https://img.example.com/b.webp',
  vod_remarks: 'HD',
  vod_year: '2024',
  vod_play_from: 'liangzi$$$lzm3u8',
  vod_play_url: 'HD$https://a.example.com/m.m3u8$$$HD$https://b.example.com/m.m3u8'
};

// 脏数据:空集名 / 播放页链接(非直链) / 空段。
const DIRTY = {
  vod_id: 88003,
  vod_name: '脏数据',
  vod_play_from: 'zy',
  vod_play_url:
    'https://cdn.example.com/naked.m3u8' + // 没有集名,整段就是地址
    '#第02集$https://cdn.example.com/2.m3u8' +
    '#第03集$/relative/not-absolute.m3u8' + // 非 http 开头,要丢掉
    '#' // 空段
};

// 真实形态:一条线路给的是网页播放页(GET 回来是 <!doctype html>),另一条才是真流。
// 实测 lziapi 的 liangzi / lzm3u8 就是这样并排放着的。
const MIXED_LINES = {
  vod_id: 88004,
  vod_name: '一真一假',
  vod_pic: 'https://img.example.com/c.webp',
  vod_remarks: '更新至第31集',
  vod_year: '2025',
  vod_play_from: 'liangzi$$$lzm3u8',
  vod_play_url:
    '第01集$https://v.example.com/share/77da6346#第02集$https://v.example.com/share/ebdbfa1c' +
    '$$$' +
    '第01集$https://v.example.com/20251025/24673/index.m3u8#第02集$https://v.example.com/20251026/24674/index.m3u8'
};

// 全部线路都认不出扩展名(直播式直链就是这样)——这时一条都不能丢。
const ALL_OPAQUE = {
  vod_id: 88005,
  vod_name: '无扩展名',
  vod_play_from: 'a$$$b',
  vod_play_url: '正片$https://a.example.com/live/9001$$$正片$https://b.example.com/live/9001'
};

function ok(payload) {
  return { status: 200, headers: { 'content-type': 'application/json' }, body: payload };
}

/** 按 query 路由的假接口。同时把收到的请求记下来,好断言「打的是哪个 ac」。 */
function fakeSite(routes) {
  const calls = [];
  const get = async (url, opts) => {
    const q = (opts && opts.query) || {};
    calls.push({ url, query: q, headers: (opts && opts.headers) || {} });
    const hit = routes(q);
    if (hit === undefined) throw new Error('夹具没覆盖这个请求:' + JSON.stringify(q));
    return hit;
  };
  return { get, calls };
}

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

// ── 用例 ──────────────────────────────────────────────────────────────

test('根目录 = 一个分类入口 + 接口顺序的内容 + 末尾一条下一页', async () => {
  const site = fakeSite((q) => {
    if (q.ac === 'detail' && !q.t && !q.wd && !q.ids) {
      return ok({ code: 1, page: 1, pagecount: 3393, limit: '20', list: [MOVIE, SERIES] });
    }
  });
  const src = load(site.get);
  const out = await src.listDir(null, SERVER);

  assert.deepEqual(
    out.map((e) => e.name),
    ['按分类浏览', '蜘蛛侠：崭新之日 · TC · 2026', '神之水滴 · 更新至17集 · 2026', '下一页 ›（第 2 / 3393 页）']
  );
  // 顺序就是接口顺序 —— 资源站给的是「最新在前」的策展序,重排就毁了。
  assert.equal(out[1].id, 'p|102595');
  assert.equal(out[2].id, 'v|95052');
  assert.equal(out[3].id, 'c||2');
  // 根目录不该把分类平铺进来:分类没有图,平铺会在海报墙里变成一排空盒子(真机上看过)。
  assert.ok(site.calls.every((c) => c.query.ac !== 'class'), '根目录连分类树都不用拉');
});

test('分类入口点进去才是顶级分类,且每个直通它的第一页', async () => {
  const site = fakeSite((q) => {
    if (q.ac === 'class') return ok({ code: 1, class: CLASS_LIST, list: [] });
  });
  const src = load(site.get);
  const out = await src.listDir('k', SERVER);
  assert.deepEqual(out.map((e) => e.name), ['电影', '连续剧']);
  assert.deepEqual(out.map((e) => e.id), ['c|1|1', 'c|2|1']);
  assert.ok(out.every((e) => e.isDir));
});

test('根目录第 2 页不再出现分类入口', async () => {
  const site = fakeSite((q) => {
    if (q.ac === 'detail' && !q.t && q.pg === '2') return ok({ code: 1, pagecount: 9, list: [MOVIE] });
  });
  const src = load(site.get);
  const out = await src.listDir('c||2', SERVER);
  assert.deepEqual(out.map((e) => e.id), ['p|102595', 'c||3']);
});

test('分类页只列自己的子分类,且用 ac=detail 带 t(不是 ac=list)', async () => {
  const site = fakeSite((q) => {
    if (q.ac === 'class') return ok({ code: 1, class: CLASS_LIST, list: [] });
    if (q.ac === 'detail' && q.t === '1') return ok({ code: 1, pagecount: 1, list: [MOVIE] });
  });
  const src = load(site.get);
  const out = await src.listDir('c|1|1', SERVER);

  assert.deepEqual(out.filter((e) => e.isDir).map((e) => e.name), ['动作片', '喜剧片']);
  // 只有一页时不该冒出「下一页」。
  assert.ok(!out.some((e) => /下一页/.test(e.name)));
  // ac=list 的条目没有 vod_pic / vod_play_url,用它整个插件就废了。
  assert.ok(site.calls.every((c) => c.query.ac !== 'list'), '不该出现 ac=list');
  assert.ok(site.calls.every((c) => c.headers['User-Agent']), '每个请求都要带 UA,不然部分站直接 403');
});

test('第 2 页不再重复列分类目录', async () => {
  const site = fakeSite((q) => {
    if (q.ac === 'detail' && q.t === '1' && q.pg === '2') return ok({ code: 1, pagecount: 5, list: [MOVIE] });
  });
  const src = load(site.get);
  const out = await src.listDir('c|1|2', SERVER);
  assert.deepEqual(out.map((e) => e.id), ['p|102595', 'c|1|3']);
  assert.ok(site.calls.every((c) => c.query.ac !== 'class'), '翻页不该再拉一次分类树');
});

test('电影直接可播,剧集是文件夹;两者都带海报', async () => {
  const site = fakeSite((q) => {
    if (q.ac === 'detail') return ok({ code: 1, pagecount: 1, list: [MOVIE, SERIES] });
  });
  const src = load(site.get);
  // [0] 是「按分类浏览」入口,内容从 [1] 起。
  const [, movie, series] = await src.listDir(null, SERVER);

  assert.equal(movie.isVideo, true);
  assert.equal(movie.raw.u, 'https://cdn.example.com/20260730/mCs9tOgt/index.m3u8');
  assert.match(movie.thumb, /^https:\/\/img\.example\.com\//);
  assert.equal(series.isDir, true);
  assert.ok(!series.isVideo);
  assert.match(series.thumb, /^https:\/\/img\.example\.com\//);
});

test('剧集页列分集,分集条目必须显式 isVideo(m3u8 常常没扩展名)', async () => {
  const site = fakeSite((q) => {
    if (q.ac === 'detail' && !q.ids) return ok({ code: 1, pagecount: 1, list: [SERIES] });
  });
  const src = load(site.get);
  await src.listDir(null, SERVER); // 先把列表页的详情缓存上
  const eps = await src.listDir('v|95052', SERVER);

  assert.deepEqual(eps.map((e) => e.name), ['第01集', '第02集', '第03集']);
  assert.ok(eps.every((e) => e.isVideo === true));
  assert.deepEqual(eps.map((e) => e.id), ['p|95052|0|0', 'p|95052|0|1', 'p|95052|0|2']);
  // 列表页已经拿回完整详情了,点进来不该再打一次接口。
  assert.equal(site.calls.filter((c) => c.query.ids).length, 0);
});

test('列表没缓存时,剧集页用 ac=detail&ids= 补一次', async () => {
  const site = fakeSite((q) => {
    if (q.ac === 'detail' && q.ids === '95052') return ok({ code: 1, list: [SERIES] });
  });
  const src = load(site.get);
  const eps = await src.listDir('v|95052', SERVER);
  assert.equal(eps.length, 3);
});

test('多线路多集 → 先选线路;多线路单集 → 线路本身就能点播', async () => {
  const site = fakeSite((q) => {
    if (q.ac === 'detail' && q.ids === '88001') return ok({ code: 1, list: [MULTILINE_SERIES] });
    if (q.ac === 'detail' && q.ids === '88002') return ok({ code: 1, list: [MULTILINE_MOVIE] });
  });
  const src = load(site.get);

  const lines = await src.listDir('v|88001', SERVER);
  assert.deepEqual(lines.map((e) => e.name), ['liangzi（2 集）', 'lzm3u8（2 集）']);
  assert.ok(lines.every((e) => e.isDir));

  const second = await src.listDir('v|88001|1', SERVER);
  assert.deepEqual(second.map((e) => e.raw.u), ['https://b.example.com/1.m3u8', 'https://b.example.com/2.m3u8']);

  // 一部电影不该为了选线路点两层。
  const movieLines = await src.listDir('v|88002', SERVER);
  assert.deepEqual(movieLines.map((e) => e.name), ['liangzi', 'lzm3u8']);
  assert.ok(movieLines.every((e) => e.isVideo === true));
  assert.equal(movieLines[1].raw.u, 'https://b.example.com/m.m3u8');
});

test('有真流的线路在时,网页播放页那条线路不摆出来', async () => {
  const site = fakeSite((q) => {
    if (q.ac === 'detail' && q.ids === '88004') return ok({ code: 1, list: [MIXED_LINES] });
  });
  const src = load(site.get);
  // 只剩一条线路 → 不该再让用户选线路,直接列分集。
  const eps = await src.listDir('v|88004', SERVER);
  assert.deepEqual(eps.map((e) => e.name), ['第01集', '第02集']);
  assert.ok(
    eps.every((e) => /\.m3u8$/.test(e.raw.u)),
    '留下来的必须是真流,不是 /share/ 那种网页播放页'
  );
});

test('一条线路都认不出扩展名时,一条都不能丢', async () => {
  const site = fakeSite((q) => {
    if (q.ac === 'detail' && q.ids === '88005') return ok({ code: 1, list: [ALL_OPAQUE] });
  });
  const src = load(site.get);
  const out = await src.listDir('v|88005', SERVER);
  // 两条线路各一集 → 线路本身可点播
  assert.deepEqual(out.map((e) => e.name), ['a', 'b']);
  assert.ok(out.every((e) => e.isVideo === true));
});

test('脏数据:空集名补默认、非 http 地址丢掉、空段跳过', async () => {
  const site = fakeSite((q) => {
    if (q.ac === 'detail' && q.ids === '88003') return ok({ code: 1, list: [DIRTY] });
  });
  const src = load(site.get);
  const eps = await src.listDir('v|88003', SERVER);
  assert.deepEqual(eps.map((e) => e.name), ['第1集', '第02集']);
  assert.deepEqual(eps.map((e) => e.raw.u), ['https://cdn.example.com/naked.m3u8', 'https://cdn.example.com/2.m3u8']);
});

test('搜索走 ac=detail&wd(ac=list&wd 会返回全站,是个安静的坑)', async () => {
  const site = fakeSite((q) => {
    if (q.ac === 'detail' && q.wd === '水滴') return ok({ code: 1, pagecount: 2, list: [SERIES] });
  });
  const src = load(site.get);
  const hits = await src.search('水滴', SERVER);

  assert.equal(site.calls[0].query.ac, 'detail');
  assert.equal(site.calls[0].query.wd, '水滴');
  assert.equal(hits[0].id, 'v|95052');
  assert.equal(hits[1].id, 's|2|水滴');
});

test('搜索翻页:关键词里带 | 也要能原样拼回去', async () => {
  const site = fakeSite((q) => {
    if (q.wd === 'a|b') return ok({ code: 1, pagecount: 9, list: [] });
  });
  const src = load(site.get);
  const out = await src.listDir('s|3|a|b', SERVER);
  assert.equal(site.calls[0].query.wd, 'a|b');
  assert.equal(site.calls[0].query.pg, '3');
  assert.equal(out[0].id, 's|4|a|b');
});

test('resolvePlay:raw 丢了也能按 id 里的坐标回站上取', async () => {
  const site = fakeSite((q) => {
    if (q.ac === 'detail' && q.ids === '88001') return ok({ code: 1, list: [MULTILINE_SERIES] });
  });
  const src = load(site.get);
  const r = await src.resolvePlay({ id: 'p|88001|1|1', name: '第02集' }, null, SERVER);
  assert.equal(r.url, 'https://b.example.com/2.m3u8');
  assert.ok(r.userAgent, '空 UA 在部分 CDN 上吃 403');

  await assert.rejects(() => src.resolvePlay({ id: 'p|88001|9|9', name: 'x' }, null, SERVER), /拿不到/);
});

test('两种真实故障要报成两句不同的话', async () => {
  // 站点返回 CF 拦截页 / 错误页
  const html = load(async () => ({ status: 200, headers: {}, body: '<html><body>403 Forbidden</body></html>' }));
  await assert.rejects(() => html.listDir(null, SERVER), /不是采集接口 JSON/);

  // 响应被截断(实测遇到过,JSON 在 9 万字符处断掉)
  const cut = load(async () => ({ status: 200, headers: {}, body: '{"code":1,"list":[{"vod_id":1,"vod_na' }));
  await assert.rejects(() => cut.listDir(null, SERVER), /JSON 不完整/);

  const dead = load(async () => ({ status: 502, headers: {}, body: '' }));
  await assert.rejects(() => dead.listDir(null, SERVER), /HTTP 502/);
});

test('没填地址时给人话,不是 undefined 报错', async () => {
  const src = load(async () => ok({ code: 1, list: [] }));
  await assert.rejects(() => src.listDir(null, { id: 'x', baseUrl: '' }), /还没填采集接口地址/);
});

// ── 跑 ────────────────────────────────────────────────────────────────

let failed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    console.log('  ok   ' + name);
  } catch (e) {
    failed++;
    console.log('  FAIL ' + name);
    console.log('       ' + String(e.message).split('\n').slice(0, 6).join('\n       '));
  }
}
console.log(`\n${tests.length - failed}/${tests.length} 通过`);
process.exit(failed ? 1 : 0);
