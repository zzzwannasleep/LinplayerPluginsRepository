import { delay } from "./data.js";

const els = {
  preloader: document.getElementById("preloader"),
  app: document.getElementById("app"),
  toc: document.getElementById("toc"),
  status: document.getElementById("status"),
  content: document.getElementById("content"),
};

// warm = 本会话已展示过加载动画，后续只淡入。
const WARM = document.documentElement.hasAttribute("data-warm");

function slugify(t) {
  return (
    String(t || "")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9一-鿿-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "section"
  );
}

function enter() {
  if (els.preloader && !WARM) {
    els.preloader.classList.add("animate__animated", "animate__fadeOut");
    els.preloader.addEventListener("animationend", () => (els.preloader.style.display = "none"), {
      once: true,
    });
  }
  els.app.classList.remove("is-hidden");
  els.app.classList.add("animate__animated", WARM ? "animate__fadeIn" : "animate__fadeInUp");
  if (WARM) els.app.style.setProperty("--animate-duration", "0.4s");
}

// 给标题设 id + 锚点，并由 h2/h3 生成目录。
function buildToc() {
  const used = new Map();
  const items = [];
  els.content.querySelectorAll("h1, h2, h3, h4").forEach((h) => {
    const text = h.textContent.trim();
    let id = slugify(text);
    const n = (used.get(id) || 0) + 1;
    used.set(id, n);
    if (n > 1) id = `${id}-${n}`;
    h.id = id;

    const lvl = Number(h.tagName[1]);
    if (lvl >= 2 && lvl <= 3) items.push({ id, text, lvl });

    const a = document.createElement("a");
    a.className = "hanchor";
    a.href = `#${id}`;
    a.textContent = "#";
    a.setAttribute("aria-label", "锚点");
    h.appendChild(a);
  });

  els.toc.innerHTML = items
    .map((it) => `<a class="toc__link toc__link--l${it.lvl}" href="#${it.id}">${it.text}</a>`)
    .join("");
}

function setupScrollSpy() {
  if (!("IntersectionObserver" in window)) return;
  const links = Array.from(els.toc.querySelectorAll("a[href^='#']"));
  const heads = Array.from(els.content.querySelectorAll("h2[id], h3[id]"));
  if (!links.length || !heads.length) return;

  let active = null;
  const setActive = (id) => {
    if (!id || id === active) return;
    active = id;
    for (const a of links) a.classList.toggle("is-active", a.getAttribute("href") === `#${id}`);
  };

  const io = new IntersectionObserver(
    (entries) => {
      const vis = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (vis.length) setActive(vis[0].target.id);
    },
    { rootMargin: "-15% 0px -75% 0px", threshold: [0, 1] }
  );
  heads.forEach((h) => io.observe(h));

  // 平滑滚动 + 更新激活态
  els.toc.addEventListener("click", (e) => {
    const a = e.target.closest("a[href^='#']");
    if (!a) return;
    const id = decodeURIComponent(a.getAttribute("href").slice(1));
    const target = document.getElementById(id);
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      history.replaceState({}, "", `#${id}`);
      setActive(id);
    }
  });
}

async function main() {
  try {
    const [md] = await Promise.all([
      fetch("SPEC.md", { cache: "no-store" }).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      }),
      delay(WARM ? 0 : 300),
    ]);

    els.content.innerHTML = window.marked.parse(md);
    els.status.style.display = "none";
    buildToc();
    enter();
    setupScrollSpy();

    // 直链锚点：渲染后滚到对应标题。
    const hash = decodeURIComponent((location.hash || "").slice(1));
    if (hash) document.getElementById(hash)?.scrollIntoView({ block: "start" });
  } catch (e) {
    els.status.textContent = `规范加载失败：${e?.message || e}`;
    enter();
  }
}

main();
