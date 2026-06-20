// 插件市场共享逻辑（无 DOM，可被 market.js / guide.js 等页面复用）。
// 数据契约见 registry.json / blocked.json。

export function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return await res.json();
}

export function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function parseBlocked(raw) {
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
      versionReasons.set(it, ""); // legacy: "id@version"
      continue;
    }
    if (typeof it === "object" && typeof it.id === "string" && typeof it.version === "string") {
      versionReasons.set(`${it.id}@${it.version}`, typeof it.reason === "string" ? it.reason : "");
    }
  }

  return {
    message: typeof raw?.message === "string" ? raw.message : "",
    pluginReasons,
    versionReasons,
  };
}

export function parseSemver(v) {
  const m = /^([0-9]+)\.([0-9]+)\.([0-9]+)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/.exec(v);
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    pre: m[4] ? m[4].split(".") : [],
  };
}

export function cmpIdentifiers(a, b) {
  const aNum = /^[0-9]+$/.test(a);
  const bNum = /^[0-9]+$/.test(b);
  if (aNum && bNum) return Number(a) - Number(b);
  if (aNum && !bNum) return -1;
  if (!aNum && bNum) return 1;
  return a.localeCompare(b);
}

export function semverCompare(a, b) {
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

export function pickBestVersion(versions, channel) {
  const list = Array.isArray(versions) ? versions.slice() : [];
  if (list.length === 0) return null;

  const byChannel = (ch) => list.filter((v) => (v?.channel ?? "stable") === ch);

  let candidates = [];
  if (channel === "all") {
    candidates = list;
  } else {
    candidates = byChannel(channel);
    if (candidates.length === 0) candidates = list;
  }

  candidates.sort((a, b) =>
    semverCompare(String(b.version ?? "0.0.0"), String(a.version ?? "0.0.0"))
  );
  return candidates[0];
}

export const TARGET_LABELS = { pc: "PC 端", mobile: "移动端", tv: "TV 端" };

export function iconCandidates(pluginId, version) {
  const base = `plugins/${encodeURIComponent(pluginId)}/${encodeURIComponent(version)}`;
  return [`${base}/icon.svg`, `${base}/icon.png`];
}

export function isPluginBlocked(blocked, pluginId) {
  return blocked.pluginReasons.has(pluginId);
}

export function isVersionBlocked(blocked, pluginId, version) {
  return blocked.versionReasons.has(`${pluginId}@${version}`);
}

export function blockedReason(blocked, pluginId, version) {
  return (
    blocked.versionReasons.get(`${pluginId}@${version}`) ||
    blocked.pluginReasons.get(pluginId) ||
    ""
  );
}
