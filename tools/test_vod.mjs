// com.linplayer.vod 的行为测试。
//
// 跑法:node tools/test_vod.mjs
//
// 夹具是从真实采集站录下来的响应,**只把主机名换成了 example.com**——分隔符、字段名、
// 字段类型(注意 limit 是字符串 "20"、score 是 "0.0")、空值形态全部逐字保留,
// 因为被测的正是这些。主机名不影响任何一条解析逻辑,而把一串真实采集站域名写进
// 公开仓库是另一回事。
//
// 测的是插件对外的四个方法,不是内部辅助函数——内部怎么拆是实现细节。

import assert from 'node:assert/strict';
import fs from 'node:fs';

const SRC = fs.readFileSync(new URL('../plugins/com.linplayer.vod/2.0.0/main.js', import.meta.url), 'utf8');

/** 把 main.js 装进一个 ctx 桩里,拿到它注册的那几个方法。 */
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
    errors: { unsupported: (m) => new Error('__LP_UNSUPPORTED__' + (m || '')) }
  };
  // eslint-disable-next-line no-new-func
  new Function('ctx', SRC)(ctx);
  assert.ok(reg, 'main.js 没有注册数据源');
  return reg;
}

const SERVER = { id: 'https://example.com/api.php/provide/vod/', baseUrl: 'https://example.com/api.php/provide/vod/' };

// ── 夹具 ──────────────────────────────────────────────────────────────

const CLASS_TREE = [
  { type_id: 1, type_pid: 0, type_name: '电影' },
  { type_id: 2, type_pid: 0, type_name: '连续剧' },
  { type_id: 6, type_pid: 1, type_name: '动作片' },
  { type_id: 7, type_pid: 1, type_name: '喜剧片' },
  { type_id: 13, type_pid: 2, type_name: '国产剧' }
];

// 实测:有的站的 class 只有 type_id + type_name,没有 type_pid(wujinapi 就是这样)。
const CLASS_FLAT = [
  { type_id: 1, type_name: '电影' },
  { type_id: 6, type_name: '动作片' }
];

const MOVIE = {
  vod_id: 102595,
  type_name: '动作片',
  vod_name: '蜘蛛侠：崭新之日',
  vod_pic: 'https://img.example.com/upload/vod/cf1cb7.webp',
  vod_remarks: 'TC',
  vod_year: '2026',
  vod_score: '0.0', // 实测大量条目就是 "0.0" = 没有评分,不该显示成 0 分
  vod_area: '美国',
  vod_lang: '英语',
  vod_class: '动作,科幻',
  vod_actor: '甲 / 乙',
  vod_director: '丙',
  vod_content: '<p>一段<b>带标签</b>的简介&nbsp;结束</p>',
  vod_play_from: 'zy',
  vod_play_url: 'TC$https://cdn.example.com/20260730/mCs9tOgt/index.m3u8'
};

const SERIES = {
  vod_id: 95052,
  vod_name: '神之水滴',
  vod_pic: 'https://img.example.com/upload/vod/e99bfa.webp',
  vod_remarks: '更新至17集',
  vod_year: '2026',
  vod_score: '8.2',
  vod_play_from: 'zy',
  vod_play_url:
    '第01集$https://cdn.example.com/a/index.m3u8' +
    '#第02集$https://cdn.example.com/b/index.m3u8' +
    '#第03集$https://cdn.example.com/c/index.m3u8'
};

// 一条线路是网页播放页(GET 回来 <!doctype html>),另一条才是真流。实测 lziapi 就这样。
const MIXED_LINES = {
  vod_id: 88004,
  vod_name: '一真一假',
  vod_play_from: 'liangzi$$$lzm3u8',
  vod_play_url:
    '第01集$https://v.example.com/share/77da#第02集$https://v.example.com/share/ebdb' +
    '$$$' +
    '第01集$https://v.example.com/20251025/index.m3u8#第02集$https://v.example.com/20251026/index.m3u8'
};

// 全部线路都认不出扩展名(直播式直链)——这时一条都不能丢。
const ALL_OPAQUE = {
  vod_id: 88005,
  vod_name: '无扩展名',
  vod_play_from: 'a$$$b',
  vod_play_url: '正片$https://a.example.com/live/9001$$$正片$https://b.example.com/live/9001'
};

// 脏数据:空集名 / 非 http 地址 / 空段。
const DIRTY = {
  vod_id: 88003,
  vod_name: '脏数据',
  vod_play_from: 'zy',
  vod_play_url:
    'https://cdn.example.com/naked.m3u8' +
    '#第02集$https://cdn.example.com/2.m3u8' +
    '#第03集$/relative/not-absolute.m3u8' +
    '#'
};

function ok(payload) {
  return { status: 200, headers: { 'content-type': 'application/json' }, body: payload };
}

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

// ── 契约 ──────────────────────────────────────────────────────────────

test('注册的是影视目录契约,**故意不实现 listDir / search**', async () => {
  const src = load(async () => ok({ code: 1, list: [] }));
  assert.deepEqual(Object.keys(src).sort(), ['catalog', 'categories', 'mediaDetail', 'resolvePlay']);
  // 实现了 listDir 就说明又在把资源站当文件树用了 —— 分类会变成文件夹、
  // 翻页会变成一个叫「下一页」的文件夹,整套交互再错一次。
  assert.equal(src.listDir, undefined, 'listDir 必须不存在');
  assert.equal(src.search, undefined, 'search 必须不存在:搜索走 catalog(keyword),这样才能翻页');
});

// ── 分类 ──────────────────────────────────────────────────────────────

test('分类按 type_pid 建成两级树', async () => {
  const site = fakeSite((q) => (q.ac === 'class' ? ok({ code: 1, class: CLASS_TREE, list: [] }) : undefined));
  const src = load(site.get);
  const tree = await src.categories(SERVER);

  assert.deepEqual(tree.map((c) => c.name), ['电影', '连续剧']);
  assert.deepEqual(tree[0].children.map((c) => c.name), ['动作片', '喜剧片']);
  assert.deepEqual(tree[1].children.map((c) => c.id), ['13']);
  assert.equal(tree[0].id, '1');
});

test('站点不给 type_pid 时压平成一级,不编造层级', async () => {
  const site = fakeSite((q) => (q.ac === 'class' ? ok({ code: 1, class: CLASS_FLAT, list: [] }) : undefined));
  const src = load(site.get);
  const tree = await src.categories(SERVER);
  assert.deepEqual(tree.map((c) => c.name), ['电影', '动作片']);
  assert.ok(tree.every((c) => c.children.length === 0));
});

test('分类树有缓存,连点两次只打一次接口', async () => {
  const site = fakeSite((q) => (q.ac === 'class' ? ok({ code: 1, class: CLASS_TREE, list: [] }) : undefined));
  const src = load(site.get);
  await src.categories(SERVER);
  await src.categories(SERVER);
  assert.equal(site.calls.length, 1);
});

// ── 目录 ──────────────────────────────────────────────────────────────

test('卡片的每样东西各占一个字段,标题里**只有标题**', async () => {
  const site = fakeSite((q) =>
    q.ac === 'detail' && !q.wd && !q.ids
      ? ok({ code: 1, pagecount: 3393, total: 67846, list: [MOVIE, SERIES] })
      : undefined,
  );
  const src = load(site.get);
  const page = await src.catalog({ page: 1 }, SERVER);

  assert.deepEqual(page.items[0], {
    id: '102595',
    title: '蜘蛛侠：崭新之日',
    poster: 'https://img.example.com/upload/vod/cf1cb7.webp',
    badge: 'TC',
    year: '2026',
    score: null, // "0.0" = 没评分,不是 0 分
    isSeries: false
  });
  // 这一条是整个 v2 的由来:v1 因为没有 badge/year 字段,只能拼成
  // 「神之水滴 · 更新至17集 · 2026」塞进标题。再犯一次就在这里红。
  assert.equal(page.items[1].title, '神之水滴');
  assert.equal(page.items[1].badge, '更新至17集');
  assert.equal(page.items[1].year, '2026');
  assert.equal(page.items[1].score, '8.2');
  assert.equal(page.items[1].isSeries, true, '多集 = 剧集');
  assert.ok(!/更新至|2026/.test(page.items[1].title), '标题里不许再出现角标和年份');
  assert.equal(page.total, 67846);
});

test('翻页靠 hasMore,不靠往列表里塞一条「下一页」', async () => {
  const site = fakeSite((q) => {
    if (q.pg === '3393') return ok({ code: 1, pagecount: 3393, list: [MOVIE] });
    return ok({ code: 1, pagecount: 3393, list: [MOVIE, SERIES] });
  });
  const src = load(site.get);

  const p1 = await src.catalog({ page: 1 }, SERVER);
  assert.equal(p1.hasMore, true);
  assert.ok(p1.items.every((i) => !/下一页/.test(i.title)), '列表里不许有翻页条目');

  const last = await src.catalog({ page: 3393 }, SERVER);
  assert.equal(last.hasMore, false, '最后一页必须停下,否则前端会一直往下拉空气');
});

test('pagecount 缺失时按「满 20 条就可能还有」兜底', async () => {
  const full = Array.from({ length: 20 }, (_, i) => ({ ...MOVIE, vod_id: i + 1 }));
  const site = fakeSite((q) => {
    if (q.pg === '1') return ok({ code: 1, list: full });
    if (q.pg === '2') return ok({ code: 1, list: [MOVIE] });
  });
  const src = load(site.get);
  assert.equal((await src.catalog({ page: 1 }, SERVER)).hasMore, true);
  assert.equal((await src.catalog({ page: 2 }, SERVER)).hasMore, false);
});

test('按分类取用 t=,且**从不**用 ac=list(它没有海报也没有播放地址)', async () => {
  const site = fakeSite((q) =>
    q.ac === 'detail' && q.t === '6' ? ok({ code: 1, pagecount: 2, list: [MOVIE] }) : undefined,
  );
  const src = load(site.get);
  await src.catalog({ categoryId: '6', page: 1 }, SERVER);

  assert.equal(site.calls[0].query.t, '6');
  assert.ok(site.calls.every((c) => c.query.ac !== 'list'), '不该出现 ac=list');
  assert.ok(site.calls.every((c) => c.headers['User-Agent']), '每个请求都要带 UA,不然部分站直接 403');
});

test('搜索走 wd 而不是 t,而且同样能翻页', async () => {
  const site = fakeSite((q) => (q.wd === '水滴' ? ok({ code: 1, pagecount: 5, list: [SERIES] }) : undefined));
  const src = load(site.get);
  const page = await src.catalog({ categoryId: '6', keyword: '水滴', page: 2 }, SERVER);

  assert.equal(site.calls[0].query.wd, '水滴');
  assert.equal(site.calls[0].query.pg, '2');
  // 搜的时候分类要让位,否则「在动作片里搜」会被站点理解成两个条件的交集然后返回空。
  assert.equal(site.calls[0].query.t, undefined);
  assert.equal(page.hasMore, true);
  assert.equal(page.items[0].id, '95052');
});

test('同一页翻回来不再打网络(点返回不该重新等一次)', async () => {
  const site = fakeSite(() => ok({ code: 1, pagecount: 9, list: [MOVIE] }));
  const src = load(site.get);
  await src.catalog({ categoryId: '6', page: 1 }, SERVER);
  await src.catalog({ categoryId: '6', page: 1 }, SERVER);
  assert.equal(site.calls.length, 1);
  await src.catalog({ categoryId: '6', page: 2 }, SERVER);
  assert.equal(site.calls.length, 2, '换一页要真的去取');
});

// ── 详情 ──────────────────────────────────────────────────────────────

test('详情给全元信息,简介剥掉 HTML 标签', async () => {
  const site = fakeSite((q) => (q.ids === '102595' ? ok({ code: 1, list: [MOVIE] }) : undefined));
  const src = load(site.get);
  const d = await src.mediaDetail('102595', SERVER);

  assert.equal(d.title, '蜘蛛侠：崭新之日');
  assert.equal(d.badge, 'TC');
  assert.equal(d.area, '美国');
  assert.equal(d.genre, '动作,科幻');
  assert.equal(d.actors, '甲 / 乙');
  assert.equal(d.score, null);
  assert.equal(d.overview, '一段带标签的简介 结束', 'vod_content 带 <p>/<b>/&nbsp;,得剥干净');
  assert.equal(d.lines.length, 1);
  assert.deepEqual(d.lines[0].episodes.map((e) => e.name), ['TC']);
  assert.equal(d.lines[0].episodes[0].raw.u, 'https://cdn.example.com/20260730/mCs9tOgt/index.m3u8');
});

test('目录页已经拿回详情了,点进去不该再打一次接口', async () => {
  const site = fakeSite((q) => {
    if (q.ids) return ok({ code: 1, list: [SERIES] });
    return ok({ code: 1, pagecount: 1, list: [SERIES] });
  });
  const src = load(site.get);
  await src.catalog({ page: 1 }, SERVER);
  const d = await src.mediaDetail('95052', SERVER);
  assert.equal(d.lines[0].episodes.length, 3);
  assert.equal(site.calls.filter((c) => c.query.ids).length, 0, '不该有 ids= 的补取请求');
});

test('没缓存时用 ac=detail&ids= 补一次', async () => {
  const site = fakeSite((q) => (q.ids === '95052' ? ok({ code: 1, list: [SERIES] }) : undefined));
  const src = load(site.get);
  const d = await src.mediaDetail('95052', SERVER);
  assert.deepEqual(d.lines[0].episodes.map((e) => e.name), ['第01集', '第02集', '第03集']);
  assert.deepEqual(d.lines[0].episodes.map((e) => e.id), ['p|95052|0|0', 'p|95052|0|1', 'p|95052|0|2']);
});

test('有真流的线路在时,网页播放页那条不摆出来', async () => {
  const site = fakeSite((q) => (q.ids === '88004' ? ok({ code: 1, list: [MIXED_LINES] }) : undefined));
  const src = load(site.get);
  const d = await src.mediaDetail('88004', SERVER);
  assert.equal(d.lines.length, 1, '/share/ 那条要被丢掉');
  assert.equal(d.lines[0].name, 'lzm3u8');
  assert.ok(d.lines[0].episodes.every((e) => /\.m3u8$/.test(e.raw.u)));
});

test('一条线路都认不出扩展名时,一条都不能丢', async () => {
  const site = fakeSite((q) => (q.ids === '88005' ? ok({ code: 1, list: [ALL_OPAQUE] }) : undefined));
  const src = load(site.get);
  const d = await src.mediaDetail('88005', SERVER);
  assert.deepEqual(d.lines.map((l) => l.name), ['a', 'b']);
});

test('脏数据:空集名补默认、非 http 丢掉、空段跳过', async () => {
  const site = fakeSite((q) => (q.ids === '88003' ? ok({ code: 1, list: [DIRTY] }) : undefined));
  const src = load(site.get);
  const d = await src.mediaDetail('88003', SERVER);
  assert.deepEqual(d.lines[0].episodes.map((e) => e.name), ['第1集', '第02集']);
});

// ── 播放 ──────────────────────────────────────────────────────────────

test('resolvePlay 优先用 raw;raw 丢了按 id 里的坐标回站上取', async () => {
  const site = fakeSite((q) => (q.ids === '88004' ? ok({ code: 1, list: [MIXED_LINES] }) : undefined));
  const src = load(site.get);

  const direct = await src.resolvePlay(
    { id: 'p|88004|0|1', name: '第02集', raw: { u: 'https://x/y.m3u8' } },
    null,
    SERVER,
  );
  assert.equal(direct.url, 'https://x/y.m3u8');
  assert.equal(site.calls.length, 0, '有 raw 就不该打网络');

  const refetched = await src.resolvePlay({ id: 'p|88004|0|1', name: '第02集' }, null, SERVER);
  assert.equal(refetched.url, 'https://v.example.com/20251026/index.m3u8');
  assert.ok(refetched.userAgent, '空 UA 在部分 CDN 上吃 403');

  await assert.rejects(() => src.resolvePlay({ id: 'p|88004|9|9', name: 'x' }, null, SERVER), /拿不到/);
});

// ── 故障 ──────────────────────────────────────────────────────────────

test('两种真实故障要报成两句不同的话', async () => {
  const html = load(async () => ({ status: 200, headers: {}, body: '<html>403 Forbidden</html>' }));
  await assert.rejects(() => html.catalog({ page: 1 }, SERVER), /不是采集接口 JSON/);

  const cut = load(async () => ({ status: 200, headers: {}, body: '{"code":1,"list":[{"vod_id":1,"vod_na' }));
  await assert.rejects(() => cut.catalog({ page: 1 }, SERVER), /JSON 不完整/);

  const dead = load(async () => ({ status: 502, headers: {}, body: '' }));
  await assert.rejects(() => dead.catalog({ page: 1 }, SERVER), /HTTP 502/);
});

test('没填地址时给人话,不是 undefined 报错', async () => {
  const src = load(async () => ok({ code: 1, list: [] }));
  await assert.rejects(() => src.categories({ id: 'x', baseUrl: '' }), /还没填采集接口地址/);
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
