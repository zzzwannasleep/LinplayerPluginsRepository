import {
  escapeHtml as esc,
  fetchJson,
  bestVersion,
  TARGET_LABELS,
  CATEGORIES,
  CATEGORY_LABEL,
  matches,
} from "./data.js";
import { permInfo } from "./permissions.js";

/* ============================================================
   插件市场（静态页，零依赖，零构建）。

   数据只有一个来源：同目录的 registry.json —— 它由 tools/build.py 从各插件的
   manifest.json 生成，图标是构建期内联的 data URI，所以这一页**一个额外请求都不发**，
   也就永远不会碎图。

   刻意没做的事：
   - 没有下载量 / 评分 / 排行。八个第一方插件，这些数字只能是编的。
   - 不按端分页签。同一批插件被画三遍是上一版最没用的部分，改成按分类分 +
     卡片上挂端徽章。
   ============================================================ */

const REGISTRY_URL = new URL("./registry.json", location.href).toString();

const state = { plugins: [], q: "", cat: "all" };

const el = (id) => document.getElementById(id);

// ---------------- 渲染 ----------------

function badgeRow(p) {
  const bits = [];
  for (const t of p.targets || []) {
    bits.push(`<span class="pill">${esc(TARGET_LABELS[t] || t)}</span>`);
  }
  const danger = (p.permissions || []).filter((x) => permInfo(x).danger);
  if (danger.length) {
    bits.push(`<span class="pill warn" title="${esc(danger.map((d) => permInfo(d).title).join("、"))}">
                 ${danger.length} 项敏感权限</span>`);
  } else if ((p.permissions || []).length) {
    bits.push(`<span class="pill ok">权限温和</span>`);
  }
  return bits.join("");
}

function cardHtml(p) {
  const v = bestVersion(p.versions);
  const icon = p.icon
    ? `<img class="ic" src="${esc(p.icon)}" alt="">`
    : `<span class="ic ph">${esc((p.name || "?").slice(0, 1))}</span>`;
  return `
    <article class="card" data-id="${esc(p.id)}">
      <header>
        ${icon}
        <div class="meta">
          <h3>${esc(p.name)}</h3>
          <p class="sub">${esc(p.author || "未署名")} · v${esc(v ? v.version : "?")} ·
             ${esc(CATEGORY_LABEL[p.category] || p.category || "工具")}</p>
        </div>
      </header>
      <p class="desc">${esc(p.description)}</p>
      <div class="pills">${badgeRow(p)}</div>
      <footer>
        <button class="btn" data-detail="${esc(p.id)}">详情</button>
        ${v ? `<a class="btn primary" href="${esc(v.package_url)}" download>下载 .ipk</a>` : ""}
      </footer>
    </article>`;
}

function render() {
  const list = state.plugins
    .filter((p) => state.cat === "all" || p.category === state.cat)
    .filter((p) => matches(p, state.q));

  el("count").textContent = String(list.length);
  el("grid").innerHTML = list.length
    ? list.map(cardHtml).join("")
    : `<p class="empty">没有匹配的插件。</p>`;

  // 分类页签上挂各自的数量，空分类直接禁用 —— 点进去一片空白是最没意义的交互。
  for (const c of CATEGORIES) {
    const n =
      c.id === "all"
        ? state.plugins.length
        : state.plugins.filter((p) => p.category === c.id).length;
    const b = document.querySelector(`[data-cat="${c.id}"]`);
    if (!b) continue;
    b.querySelector(".n").textContent = n;
    b.disabled = n === 0 && c.id !== "all";
    b.classList.toggle("on", state.cat === c.id);
  }
}

// ---------------- 详情 ----------------

function permListHtml(perms) {
  if (!perms || !perms.length) return `<p class="hint">这个插件不申请任何权限。</p>`;
  return `<ul class="perms">${perms
    .map((id) => {
      const i = permInfo(id);
      return `<li class="${i.danger ? "danger" : ""}">
        <b>${esc(i.title)}</b><span>${esc(i.desc)}</span>
      </li>`;
    })
    .join("")}</ul>`;
}

function contributesHtml(c) {
  if (!c) return "";
  const rows = [];
  const n = (k) => (Array.isArray(c[k]) ? c[k].length : c[k] ? 1 : 0);
  if (n("dataSources")) rows.push(`${n("dataSources")} 个数据源`);
  if (n("panels")) rows.push(`${n("panels")} 块界面`);
  if (n("actions")) rows.push(`${n("actions")} 个操作项`);
  if (n("sandboxViews")) rows.push(`${n("sandboxViews")} 个自定义界面`);
  return rows.length ? `<p class="hint">装上后会加入：${esc(rows.join("、"))}</p>` : "";
}

function openDetail(id) {
  const p = state.plugins.find((x) => x.id === id);
  if (!p) return;
  const v = bestVersion(p.versions);
  const dlg = el("detail");
  el("dTitle").textContent = p.name;
  el("dBody").innerHTML = `
    <p class="sub mono">${esc(p.id)}</p>
    <p>${esc(p.description)}</p>
    ${contributesHtml(p.contributes)}
    ${p.tags && p.tags.length ? `<div class="pills">${p.tags.map((t) => `<span class="pill">${esc(t)}</span>`).join("")}</div>` : ""}

    <h4>启用前它会要这些权限</h4>
    ${permListHtml(p.permissions)}

    <h4>版本</h4>
    <table class="vt">
      <tr><th>版本</th><td>${esc(v ? v.version : "?")}</td></tr>
      <tr><th>需要 App</th><td>${esc(v && v.min_app_version ? v.min_app_version + " 及以上" : "不限")}</td></tr>
      <tr><th>校验和</th><td class="mono sha">${esc(v && v.sha256 ? v.sha256 : "无")}</td></tr>
    </table>
    ${v && v.changelog ? `<h4>更新说明</h4><pre class="log">${esc(v.changelog)}</pre>` : ""}

    <h4>怎么装</h4>
    <ol class="how">
      <li>推荐：打开 LinPlayer → 侧栏「插件」→ 在「发现」里搜「${esc(p.name)}」→ 安装。</li>
      <li>或者：下载下面这个 .ipk，在「插件 → 已安装 → 安装本地插件」里选它。</li>
    </ol>
    <div class="acts">
      ${v ? `<a class="btn primary" href="${esc(v.package_url)}" download>下载 ${esc(p.id)}-${esc(v.version)}.ipk</a>` : ""}
      ${p.homepage ? `<a class="btn" href="${esc(p.homepage)}" target="_blank" rel="noreferrer">插件主页</a>` : ""}
    </div>`;
  dlg.showModal();
  history.replaceState(null, "", `?id=${encodeURIComponent(id)}`);
}

// ---------------- 启动 ----------------

async function init() {
  el("tabs").innerHTML = CATEGORIES.map(
    (c) => `<button class="tab" data-cat="${c.id}">${esc(c.label)}<i class="n">0</i></button>`,
  ).join("");

  try {
    const reg = await fetchJson(REGISTRY_URL);
    const v = Number(reg && reg.schemaVersion);
    state.plugins = Array.isArray(reg && reg.plugins) ? reg.plugins : [];
    // 老的 v1 索引里 author 是对象、版本键是 camelCase，这一页读出来会到处是 undefined。
    // 与其画一堆空白，不如直说。
    if (v && v < 2) {
      el("warn").hidden = false;
      el("warn").textContent = `这个 registry.json 还是旧版（schemaVersion ${v}），需要用 tools/build.py 重新生成。`;
    }
  } catch (e) {
    el("warn").hidden = false;
    el("warn").textContent = `插件索引加载失败：${e}。刷新试试，或直接去 GitHub 仓库看。`;
  }

  el("q").addEventListener("input", (e) => {
    state.q = e.target.value.trim();
    render();
  });
  el("tabs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-cat]");
    if (!b || b.disabled) return;
    state.cat = b.dataset.cat;
    render();
  });
  el("grid").addEventListener("click", (e) => {
    const b = e.target.closest("[data-detail]");
    if (b) openDetail(b.dataset.detail);
  });
  el("detail").addEventListener("close", () => history.replaceState(null, "", location.pathname));
  el("dClose").addEventListener("click", () => el("detail").close());

  render();
  document.body.classList.remove("loading");

  // 深链 ?id=com.linplayer.xxx 直接开详情（分享用）。
  const want = new URLSearchParams(location.search).get("id");
  if (want) openDetail(want);
}

init();
