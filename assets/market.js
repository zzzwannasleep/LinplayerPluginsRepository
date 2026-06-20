import {
  escapeHtml as esc,
  fetchJson,
  delay,
  parseBlocked,
  pickBestVersion,
  semverCompare,
  TARGET_LABELS,
  iconCandidates,
  isPluginBlocked,
  isVersionBlocked,
  blockedReason,
} from "./data.js";

const registryUrl = new URL("./registry.json", location.href).toString();
const blockedUrl = new URL("./blocked.json", location.href).toString();
const TABS = ["pc", "mobile", "tv"];

const els = {
  preloader: document.getElementById("preloader"),
  plText: document.getElementById("plText"),
  app: document.getElementById("app"),
  q: document.getElementById("q"),
  count: document.getElementById("count"),
  updatedAt: document.getElementById("updatedAt"),
  warn: document.getElementById("warn"),
  gridpc: document.getElementById("grid-pc"),
  gridmobile: document.getElementById("grid-mobile"),
  gridtv: document.getElementById("grid-tv"),
};

const state = { registry: null, blocked: null, plugins: [], q: "" };
let layer = null;

// warm = 本会话已展示过加载动画（由 HTML head 脚本置位），后续只淡入、不再显示 loader。
const WARM = document.documentElement.hasAttribute("data-warm");

// 看门狗：若 8 秒后仍未进入（网络/异常/旧缓存等），给出可见提示与重试，避免无限转圈。
setTimeout(() => {
  if (els.app && els.app.classList.contains("is-hidden") && els.plText) {
    els.plText.innerHTML =
      '加载较慢或失败 · <a href="#" id="wd-retry" style="color:var(--brand);font-weight:700">点此重试</a>（仍不行请 Ctrl+F5 强制刷新）';
    const r = document.getElementById("wd-retry");
    if (r) r.onclick = (e) => { e.preventDefault(); location.reload(); };
  }
}, 8000);

// ---------------- init ----------------
async function init() {
  try {
    const [registry, blockedRaw] = await Promise.all([
      fetchJson(registryUrl),
      fetchJson(blockedUrl).catch(() => null),
      delay(WARM ? 0 : 400),
    ]);
    state.registry = registry;
    state.blocked = parseBlocked(blockedRaw || {});
    state.plugins = Array.isArray(registry?.plugins) ? registry.plugins : [];

    fillHeader();
    enterApp();

    const layui = window.layui;
    if (!layui) throw new Error("layui 未加载");
    layui.use(["element", "layer"], function () {
      layer = layui.layer;
      renderAll();
      bindSearch();
      bindClicks();
      openFromQuery();
    });
  } catch (e) {
    showError(e);
  }
}

function enterApp() {
  const pre = els.preloader;
  if (pre && !WARM) {
    pre.classList.add("animate__animated", "animate__fadeOut");
    pre.addEventListener("animationend", () => (pre.style.display = "none"), { once: true });
  }
  els.app.classList.remove("is-hidden");
  els.app.classList.add("animate__animated", WARM ? "animate__fadeIn" : "animate__fadeInUp");
  if (WARM) els.app.style.setProperty("--animate-duration", "0.4s");
}

function showError(e) {
  els.plText.innerHTML = `加载失败：${esc(e?.message || e)} · <a href="#" id="retry" style="color:var(--brand);font-weight:700">重试</a>`;
  const r = document.getElementById("retry");
  if (r)
    r.onclick = (ev) => {
      ev.preventDefault();
      location.reload();
    };
}

function fillHeader() {
  els.updatedAt.textContent = state.registry?.updatedAt
    ? new Date(state.registry.updatedAt).toLocaleString()
    : "-";
  const msg = state.blocked?.message;
  if (msg) {
    els.warn.textContent = msg;
    els.warn.classList.remove("is-hidden");
  }
}

// ---------------- render ----------------
function matchSearch(p, q) {
  if (!q) return true;
  const hay = [p.id, p.name, p.description, p.author?.name, ...(p.tags || [])]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
  return hay.includes(q);
}

function renderAll() {
  const q = state.q.trim().toLowerCase();
  let matchedTotal = new Set();
  for (const target of TABS) {
    const list = state.plugins.filter(
      (p) => Array.isArray(p.targets) && p.targets.includes(target) && matchSearch(p, q)
    );
    list.forEach((p) => matchedTotal.add(p.id));
    const grid = els["grid" + target];
    grid.innerHTML = list.length
      ? list.map((p, i) => cardHtml(p, i)).join("")
      : emptyHtml();
    wireIcons(grid);
  }
  els.count.textContent = String(matchedTotal.size);
}

function iconHtml(p, best) {
  const cands = best ? iconCandidates(p.id, best.version) : [];
  const letter = esc((p.name || p.id || "?").trim().charAt(0).toUpperCase());
  if (!cands.length) return `<span class="letter">${letter}</span>`;
  return `<img alt="" loading="lazy" src="${esc(cands[0])}" data-next="${esc(cands[1] || "")}" data-letter="${letter}">`;
}

function wireIcons(grid) {
  grid.querySelectorAll(".pcard__icon img").forEach((img) => {
    img.onerror = () => {
      const next = img.getAttribute("data-next");
      if (next) {
        img.removeAttribute("data-next");
        img.src = next;
        return;
      }
      const span = document.createElement("span");
      span.className = "letter";
      span.textContent = img.getAttribute("data-letter") || "?";
      img.replaceWith(span);
    };
  });
}

function pillsHtml(p, blocked) {
  const t = (p.targets || []).map((x) => `<span class="pill pill--brand">${esc(TARGET_LABELS[x] || x)}</span>`).join("");
  const tags = (p.tags || []).slice(0, 4).map((x) => `<span class="pill">${esc(x)}</span>`).join("");
  const b = blocked ? `<span class="pill pill--danger">已下架</span>` : "";
  return t + tags + b;
}

function cardHtml(p, i) {
  const best = pickBestVersion(p.versions, "stable");
  const ver = best?.version ?? "";
  const ch = best?.channel ?? "stable";
  const pkg = best?.packageUrl ?? "";
  const blocked =
    isPluginBlocked(state.blocked, p.id) ||
    (best ? isVersionBlocked(state.blocked, p.id, best.version) : false);
  const author = p.author?.name ? `作者 ${esc(p.author.name)}` : "";
  const dl =
    pkg && !blocked
      ? `<a class="btn btn--primary" href="${esc(pkg)}" download>下载 .ipk</a>`
      : `<span class="btn btn--primary is-disabled">下载 .ipk</span>`;
  const delayMs = Math.min(i, 10) * 40;
  return `<article class="pcard animate__animated animate__fadeInUp" data-id="${esc(p.id)}" style="animation-delay:${delayMs}ms">
    <div class="pcard__top">
      <div class="pcard__icon">${iconHtml(p, best)}</div>
      <div class="pcard__id-row">
        <div class="pcard__title-row">
          <div class="pcard__title">${esc(p.name || p.id)}</div>
          <div class="pcard__ver">${esc(ch)} ${esc(ver)}</div>
        </div>
        <div class="pcard__id">${esc(p.id)}</div>
      </div>
    </div>
    <div class="pills">${pillsHtml(p, blocked)}</div>
    <div class="pcard__desc">${esc(p.description || "")}</div>
    <div class="pcard__meta">
      ${author ? `<span class="pill">${author}</span>` : ""}
      ${best ? `<span class="pill">minHost ${esc(best.minHostVersion || "-")}</span>` : ""}
    </div>
    <div class="pcard__actions">${dl}<button class="btn" data-detail>详情</button></div>
  </article>`;
}

function emptyHtml() {
  return `<div class="empty">
    <div class="empty__eyebrow">没有匹配的插件</div>
    <div class="empty__title">这个分类下暂时没有结果</div>
    <div class="empty__desc">换个搜索词，或切到其它端看看。</div>
  </div>`;
}

// ---------------- detail (layer) ----------------
function openDetail(id) {
  const p = state.plugins.find((x) => x.id === id);
  if (!p || !layer) return;
  const versions = (p.versions || [])
    .slice()
    .sort((a, b) => semverCompare(String(b.version ?? "0.0.0"), String(a.version ?? "0.0.0")));
  const pluginBlocked = isPluginBlocked(state.blocked, p.id);

  const rows = versions
    .map((v) => {
      const vBlocked = pluginBlocked || isVersionBlocked(state.blocked, p.id, v.version);
      const pkg = v.packageUrl || "";
      const man = v.manifestUrl || "";
      const dl =
        pkg && !vBlocked
          ? `<a class="btn btn--primary" href="${esc(pkg)}" download>下载 .ipk</a>`
          : `<span class="btn btn--primary is-disabled">下载</span>`;
      return `<tr>
        <td>${esc(v.channel || "stable")}</td>
        <td>${esc(v.version || "")}${vBlocked ? ' <span class="pill pill--danger">已下架</span>' : ""}</td>
        <td>${esc(v.minHostVersion || "-")}</td>
        <td><div class="vt-actions">${dl}<span class="link" data-copy="${esc(man)}">复制清单</span><a class="link" href="${esc(man)}" target="_blank" rel="noreferrer">打开</a></div></td>
      </tr>`;
    })
    .join("");

  const reason = pluginBlocked ? blockedReason(state.blocked, p.id, "") : "";
  const content = `<div class="detail">
    <div class="detail__sub">${esc(p.id)}</div>
    <div class="pills detail__pills">${pillsHtml(p, pluginBlocked)}</div>
    <p class="detail__desc">${esc(p.description || "")}</p>
    <div class="detail__h">版本</div>
    <table class="vtable"><thead><tr><th>通道</th><th>版本</th><th>minHost</th><th>下载 / 清单</th></tr></thead><tbody>${rows}</tbody></table>
    ${pluginBlocked ? `<div class="detail__blocked">该插件已下架。${reason ? "原因：" + esc(reason) : ""}</div>` : ""}
  </div>`;

  layer.open({
    type: 1,
    title: esc(p.name || p.id),
    shadeClose: true,
    area: "640px",
    content,
    end: () => setQueryId(null),
  });
  setQueryId(p.id);
}

function setQueryId(id) {
  const u = new URL(location.href);
  if (id) u.searchParams.set("id", id);
  else u.searchParams.delete("id");
  history.replaceState({}, "", u.toString());
}

function openFromQuery() {
  const id = new URL(location.href).searchParams.get("id");
  if (id && state.plugins.some((p) => p.id === id)) openDetail(id);
}

// ---------------- events ----------------
function bindSearch() {
  let t;
  els.q.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => {
      state.q = els.q.value;
      renderAll();
    }, 120);
  });
}

function bindClicks() {
  // 卡片：点链接(下载)只下载；点其余区域开详情。
  for (const target of TABS) {
    els["grid" + target].addEventListener("click", (e) => {
      if (e.target.closest("a")) return;
      const card = e.target.closest(".pcard");
      if (card) openDetail(card.getAttribute("data-id"));
    });
  }
  // 复制清单链接（弹窗内，事件委托到 document）。
  document.addEventListener("click", async (e) => {
    const c = e.target.closest("[data-copy]");
    if (!c) return;
    const txt = c.getAttribute("data-copy");
    if (!txt) return;
    try {
      await navigator.clipboard.writeText(txt);
      if (layer) layer.msg("已复制清单链接");
    } catch {
      window.prompt("复制：", txt);
    }
  });
}

init();
