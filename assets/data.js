// 市场页共享逻辑（无 DOM，可被各页面复用）。数据契约见 registry.json。

export function escapeHtml(s) {
  return String(s ?? "")
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

/** 语义化版本比较。宽松：非数字段按 0，缺段补 0（registry 是外部数据，别为一条歪版本号炸整页）。 */
export function semverCompare(a, b) {
  const parse = (s) =>
    String(s ?? "")
      .split(/[-+]/)[0]
      .split(".")
      .map((x) => Number(x) || 0);
  const va = parse(a);
  const vb = parse(b);
  for (let i = 0; i < Math.max(va.length, vb.length); i++) {
    const d = (va[i] || 0) - (vb[i] || 0);
    if (d) return d;
  }
  return 0;
}

/** 取版本号最大的那一版。
 *  ★ **不能信数组顺序** —— 同一个项目在 GitHub Releases 上栽过：id / created / published
 *    三个键的返回顺序全是反的。自己按版本号取最大是唯一靠得住的做法。 */
export function bestVersion(versions) {
  const list = Array.isArray(versions) ? versions.slice() : [];
  if (!list.length) return null;
  return list.sort((a, b) => semverCompare(b.version, a.version))[0];
}

export const TARGET_LABELS = { pc: "电脑", mobile: "手机", tv: "电视" };

/** 分类。和宿主 manifest.rs::CATEGORIES 一一对应。 */
export const CATEGORIES = [
  { id: "all", label: "全部" },
  { id: "source", label: "数据源" },
  { id: "ui", label: "界面" },
  { id: "player", label: "播放" },
  { id: "notify", label: "通知" },
  { id: "tools", label: "工具" },
];

export const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]));

/** 搜索匹配：名称 / id / 描述 / 标签 / 作者。多个词是「与」。 */
export function matches(p, q) {
  if (!q) return true;
  const hay = [p.id, p.name, p.description, p.author, ...(p.tags || [])].join(" ").toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((t) => hay.includes(t));
}
