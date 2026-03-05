const registryUrl = new URL("./registry.json", location.href).toString();
const blockedUrl = new URL("./blocked.json", location.href).toString();

const elements = {
  q: document.getElementById("q"),
  target: document.getElementById("target"),
  channel: document.getElementById("channel"),
  sort: document.getElementById("sort"),
  showBlocked: document.getElementById("showBlocked"),
  count: document.getElementById("count"),
  updatedAt: document.getElementById("updatedAt"),
  warn: document.getElementById("warn"),
  list: document.getElementById("list"),
  modal: document.getElementById("modal"),
  modalTitle: document.getElementById("modalTitle"),
  modalSub: document.getElementById("modalSub"),
  modalBadges: document.getElementById("modalBadges"),
  modalDesc: document.getElementById("modalDesc"),
  modalVersions: document.getElementById("modalVersions"),
  modalBlocked: document.getElementById("modalBlocked"),
  toast: document.getElementById("toast")
};

const state = {
  registry: null,
  blocked: { message: "", pluginReasons: new Map(), versionReasons: new Map() },
  view: {
    q: "",
    target: "all",
    channel: "stable",
    sort: "name",
    showBlocked: true
  }
};

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return await res.json();
}

function parseBlocked(raw) {
  const pluginReasons = new Map();
  const versionReasons = new Map();

  const blockedPlugins = Array.isArray(raw?.blockedPlugins) ? raw.blockedPlugins : [];
  for (const it of blockedPlugins) {
    if (typeof it === "string") {
      pluginReasons.set(it, "");
      continue;
    }
    if (it && typeof it === "object" && typeof it.id === "string") {
      pluginReasons.set(it.id, typeof it.reason === "string" ? it.reason : "");
    }
  }

  const blockedVersions = Array.isArray(raw?.blockedVersions) ? raw.blockedVersions : [];
  for (const it of blockedVersions) {
    if (!it) continue;
    if (typeof it === "string") {
      // legacy: "id@version"
      versionReasons.set(it, "");
      continue;
    }
    if (typeof it === "object" && typeof it.id === "string" && typeof it.version === "string") {
      const key = `${it.id}@${it.version}`;
      versionReasons.set(key, typeof it.reason === "string" ? it.reason : "");
    }
  }

  return {
    message: typeof raw?.message === "string" ? raw.message : "",
    pluginReasons,
    versionReasons
  };
}

function parseSemver(v) {
  const m = /^([0-9]+)\.([0-9]+)\.([0-9]+)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/.exec(v);
  if (!m) return null;
  const major = Number(m[1]);
  const minor = Number(m[2]);
  const patch = Number(m[3]);
  const pre = m[4] ? m[4].split(".") : [];
  return { major, minor, patch, pre };
}

function cmpIdentifiers(a, b) {
  const aNum = /^[0-9]+$/.test(a);
  const bNum = /^[0-9]+$/.test(b);
  if (aNum && bNum) return Number(a) - Number(b);
  if (aNum && !bNum) return -1;
  if (!aNum && bNum) return 1;
  return a.localeCompare(b);
}

function semverCompare(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return String(a).localeCompare(String(b));

  if (pa.major !== pb.major) return pa.major - pb.major;
  if (pa.minor !== pb.minor) return pa.minor - pb.minor;
  if (pa.patch !== pb.patch) return pa.patch - pb.patch;

  const aPre = pa.pre;
  const bPre = pb.pre;
  if (aPre.length === 0 && bPre.length === 0) return 0;
  if (aPre.length === 0) return 1;
  if (bPre.length === 0) return -1;

  const len = Math.max(aPre.length, bPre.length);
  for (let i = 0; i < len; i++) {
    const ai = aPre[i];
    const bi = bPre[i];
    if (ai === undefined) return -1;
    if (bi === undefined) return 1;
    const c = cmpIdentifiers(ai, bi);
    if (c !== 0) return c;
  }
  return 0;
}

function pickBestVersion(versions, channel) {
  const list = Array.isArray(versions) ? versions.slice() : [];
  if (list.length === 0) return null;

  const byChannel = (ch) => list.filter(v => (v?.channel ?? "stable") === ch);

  let candidates = [];
  if (channel === "all") {
    candidates = list;
  } else {
    candidates = byChannel(channel);
    if (candidates.length === 0) candidates = list;
  }

  candidates.sort((a, b) => semverCompare(String(b.version ?? "0.0.0"), String(a.version ?? "0.0.0")));
  return candidates[0];
}

function badge(text, kind = "") {
  const cls = kind ? `badge badge--${kind}` : "badge";
  return `<span class="${cls}">${escapeHtml(text)}</span>`;
}

function formatTargets(targets) {
  const arr = Array.isArray(targets) ? targets : [];
  const map = { tv: "TV", mobile: "移动端", pc: "PC" };
  return arr.map(t => badge(map[t] ?? t, "brand")).join("");
}

function iconCandidates(pluginId, version) {
  const base = `plugins/${encodeURIComponent(pluginId)}/${encodeURIComponent(version)}`;
  return [`${base}/icon.svg`, `${base}/icon.png`];
}

function isPluginBlocked(pluginId) {
  return state.blocked.pluginReasons.has(pluginId);
}

function isVersionBlocked(pluginId, version) {
  return state.blocked.versionReasons.has(`${pluginId}@${version}`);
}

function blockedReason(pluginId, version) {
  const vKey = `${pluginId}@${version}`;
  return state.blocked.versionReasons.get(vKey) || state.blocked.pluginReasons.get(pluginId) || "";
}

function toast(msg) {
  elements.toast.textContent = msg;
  elements.toast.classList.add("show");
  window.clearTimeout(toast._t);
  toast._t = window.setTimeout(() => elements.toast.classList.remove("show"), 1600);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("已复制安装链接");
  } catch {
    // fallback
    window.prompt("复制安装链接：", text);
  }
}

function renderList() {
  const registry = state.registry;
  const plugins = Array.isArray(registry?.plugins) ? registry.plugins : [];

  const q = state.view.q.trim().toLowerCase();
  const target = state.view.target;
  const channel = state.view.channel;
  const showBlocked = state.view.showBlocked;

  let filtered = plugins.filter(p => {
    if (!p || typeof p !== "object") return false;

    const targets = Array.isArray(p.targets) ? p.targets : [];
    if (target !== "all" && !targets.includes(target)) return false;

    const best = pickBestVersion(p.versions, channel);
    if (!best) return false;

    const blocked = isPluginBlocked(p.id) || isVersionBlocked(p.id, best.version);
    if (!showBlocked && blocked) return false;

    if (!q) return true;
    const hay = [
      p.id,
      p.name,
      p.description,
      p.author?.name,
      ...(Array.isArray(p.tags) ? p.tags : [])
    ]
      .filter(Boolean)
      .map(x => String(x).toLowerCase())
      .join("\n");
    return hay.includes(q);
  });

  const by = state.view.sort;
  filtered.sort((a, b) => {
    const av = pickBestVersion(a.versions, channel);
    const bv = pickBestVersion(b.versions, channel);
    if (by === "id") return String(a.id).localeCompare(String(b.id));
    if (by === "version") {
      return semverCompare(String(bv?.version ?? "0.0.0"), String(av?.version ?? "0.0.0"));
    }
    return String(a.name ?? a.id).localeCompare(String(b.name ?? b.id));
  });

  elements.count.textContent = String(filtered.length);

  const cards = filtered.map(p => {
    const best = pickBestVersion(p.versions, channel);
    const blocked = isPluginBlocked(p.id) || (best ? isVersionBlocked(p.id, best.version) : false);
    const iconUrl = p.iconUrl || (best ? iconCandidates(p.id, best.version)[0] : "");
    const channelText = best?.channel ?? "stable";
    const author = p.author?.name ? `作者：${p.author.name}` : "";

    const badges = [
      ...((Array.isArray(p.tags) ? p.tags : []).slice(0, 6).map(t => badge(t))),
      ...(blocked ? [badge("已下架", "danger")] : [])
    ].join("");

    return `
      <article class="card" data-id="${escapeHtml(p.id)}">
        <div class="card__top">
          <div class="card__icon" data-icon>
            <img src="${escapeHtml(iconUrl)}" alt="" loading="lazy" />
          </div>
          <div>
            <div class="card__title">${escapeHtml(p.name ?? p.id)}</div>
            <div class="card__id">${escapeHtml(p.id)}</div>
            <div class="badges">${formatTargets(p.targets)}${badges ? "" : ""}${badges}</div>
          </div>
        </div>

        <div class="card__desc">${escapeHtml(p.description ?? "")}</div>

        <div class="meta">
          <span>${escapeHtml(author)}</span>
          <span>${escapeHtml(channelText)} ${escapeHtml(best?.version ?? "")}</span>
          <span>minHost ${escapeHtml(best?.minHostVersion ?? "-")}</span>
        </div>

        <div class="card__actions">
          <button class="btn primary" data-action="copy" ${blocked ? "disabled" : ""}>复制安装链接</button>
          <button class="btn" data-action="details">详情</button>
        </div>
      </article>
    `;
  });

  elements.list.innerHTML = cards.join("");

  // icon fallback
  for (const card of elements.list.querySelectorAll(".card")) {
    const img = card.querySelector("[data-icon] img");
    if (!img) continue;
    const id = card.getAttribute("data-id");
    const plugin = plugins.find(p => p?.id === id);
    const best = plugin ? pickBestVersion(plugin.versions, channel) : null;
    const [svgUrl, pngUrl] = best ? iconCandidates(id, best.version) : ["", ""]; 

    img.addEventListener(
      "error",
      () => {
        if (img.src.endsWith("icon.svg") && pngUrl) {
          img.src = pngUrl;
          return;
        }
        const wrap = img.closest("[data-icon]");
        if (wrap) {
          wrap.innerHTML = `<span>${escapeHtml(String(plugin?.name ?? id).slice(0, 1).toUpperCase())}</span>`;
        }
      }
    );
  }
}

function openModal(pluginId) {
  const registry = state.registry;
  const plugins = Array.isArray(registry?.plugins) ? registry.plugins : [];
  const plugin = plugins.find(p => p?.id === pluginId);
  if (!plugin) return;

  const channel = state.view.channel;
  const versions = Array.isArray(plugin.versions) ? plugin.versions.slice() : [];
  versions.sort((a, b) => semverCompare(String(b.version ?? "0.0.0"), String(a.version ?? "0.0.0")));

  const best = pickBestVersion(plugin.versions, channel);
  const blockedP = isPluginBlocked(pluginId);

  elements.modalTitle.textContent = plugin.name ?? plugin.id;
  elements.modalSub.textContent = `${plugin.id}${best ? ` • 最新：${best.channel ?? "stable"} ${best.version}` : ""}`;
  elements.modalDesc.textContent = plugin.description ?? "";

  const badgesHtml = [
    ...((Array.isArray(plugin.targets) ? plugin.targets : []).map(t => ({ tv: "TV", mobile: "移动端", pc: "PC" }[t] ?? t)).map(t => badge(t, "brand"))),
    ...((Array.isArray(plugin.tags) ? plugin.tags : []).map(t => badge(t)))
  ];
  if (blockedP) badgesHtml.push(badge("已下架", "danger"));
  elements.modalBadges.innerHTML = badgesHtml.join("");

  elements.modalVersions.innerHTML = versions
    .map(v => {
      const ver = String(v.version ?? "");
      const ch = String(v.channel ?? "stable");
      const minHost = String(v.minHostVersion ?? "-");
      const url = String(v.manifestUrl ?? "");
      const blockedV = isVersionBlocked(pluginId, ver);
      const blocked = blockedP || blockedV;
      return `
        <tr>
          <td>${escapeHtml(ch)}</td>
          <td>${escapeHtml(ver)}${blockedV ? ` <span class="badge badge--danger">blocked</span>` : ""}</td>
          <td>${escapeHtml(minHost)}</td>
          <td>
            <div class="install">
              <button class="btn" data-copy="${escapeHtml(url)}" ${blocked ? "disabled" : ""}>复制</button>
              <a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">打开</a>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  const r = best ? blockedReason(pluginId, best.version) : blockedReason(pluginId, "");
  if (blockedP || (best && isVersionBlocked(pluginId, best.version))) {
    elements.modalBlocked.textContent = `该插件/版本已被下架。${r ? `原因：${r}` : ""}`;
    elements.modalBlocked.classList.add("show");
  } else {
    elements.modalBlocked.textContent = "";
    elements.modalBlocked.classList.remove("show");
  }

  elements.modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";

  const url = new URL(location.href);
  url.searchParams.set("id", pluginId);
  history.replaceState({}, "", url.toString());
}

function closeModal() {
  elements.modal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";

  const url = new URL(location.href);
  url.searchParams.delete("id");
  history.replaceState({}, "", url.toString());
}

function bind() {
  const sync = () => {
    state.view.q = elements.q.value;
    state.view.target = elements.target.value;
    state.view.channel = elements.channel.value;
    state.view.sort = elements.sort.value;
    state.view.showBlocked = elements.showBlocked.checked;
    renderList();
  };

  elements.q.addEventListener("input", () => {
    // small debounce
    window.clearTimeout(bind._t);
    bind._t = window.setTimeout(sync, 120);
  });
  elements.target.addEventListener("change", sync);
  elements.channel.addEventListener("change", sync);
  elements.sort.addEventListener("change", sync);
  elements.showBlocked.addEventListener("change", sync);

  elements.list.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    const card = e.target.closest(".card");
    if (!card) return;
    const id = card.getAttribute("data-id");
    if (!id) return;

    const action = btn?.getAttribute("data-action") ?? "";
    if (action === "copy") {
      const plugin = state.registry?.plugins?.find?.((p) => p?.id === id);
      const best = plugin ? pickBestVersion(plugin.versions, state.view.channel) : null;
      if (best?.manifestUrl) await copyText(best.manifestUrl);
      return;
    }

    if (action === "details") {
      openModal(id);
      return;
    }

    // click card opens details
    openModal(id);
  });

  elements.modal.addEventListener("click", async (e) => {
    const close = e.target.closest("[data-close]");
    if (close) {
      closeModal();
      return;
    }

    const copy = e.target.closest("button[data-copy]");
    if (copy) {
      const url = copy.getAttribute("data-copy") ?? "";
      if (url) await copyText(url);
    }
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && elements.modal.getAttribute("aria-hidden") === "false") {
      closeModal();
    }
  });
}

function renderHeader() {
  elements.updatedAt.textContent = state.registry?.updatedAt ? new Date(state.registry.updatedAt).toLocaleString() : "-";

  const warnings = [];
  if (state.blocked.message) warnings.push(state.blocked.message);
  elements.warn.textContent = warnings.join(" ");
}

async function init() {
  bind();

  try {
    const [registry, blocked] = await Promise.all([
      fetchJson(registryUrl),
      fetchJson(blockedUrl).catch(() => null)
    ]);
    state.registry = registry;
    if (blocked) state.blocked = parseBlocked(blocked);
    renderHeader();
    renderList();

    const id = new URL(location.href).searchParams.get("id");
    if (id) openModal(id);
  } catch (e) {
    elements.list.innerHTML = `<div class="panel" style="margin-top:16px">加载失败：${escapeHtml(String(e))}</div>`;
  }
}

init();
