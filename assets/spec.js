/* 把一份 Markdown 渲染成带侧边目录的文档页。spec.html 和 guide.html 共用，
   区别只是 <body data-md="..."> 指向哪个文件。

   marked 是唯一保留的第三方库（36KB）—— 规范和指南都得同时能在 GitHub 上直接读，
   所以源文件必须是 Markdown，那就需要一个渲染器。 */

const src = document.body.dataset.md || "SPEC.md";
const prose = document.getElementById("prose");
const toc = document.getElementById("toc");

const slug = (s) =>
  s.trim().toLowerCase().replace(/[^\w一-龥]+/g, "-").replace(/^-+|-+$/g, "");

async function main() {
  let md;
  try {
    const res = await fetch(src, { cache: "no-store" });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    md = await res.text();
  } catch (e) {
    prose.innerHTML = `<p class="warn">文档加载失败：${e}</p>`;
    return;
  }

  prose.innerHTML = window.marked.parse(md);

  // 给标题补 id 并生成目录。用文本 slug 而不是序号 —— 序号会在中间插入一节之后
  // 让所有已经发出去的链接指向别的地方。
  const heads = [...prose.querySelectorAll("h2, h3")];
  const seen = new Map();
  for (const h of heads) {
    let id = slug(h.textContent);
    const n = (seen.get(id) || 0) + 1;
    seen.set(id, n);
    if (n > 1) id += `-${n}`;
    h.id = id;
  }
  toc.innerHTML = heads
    .map((h) => `<a href="#${h.id}" class="${h.tagName === "H3" ? "lv3" : ""}">${h.textContent}</a>`)
    .join("");

  // 滚动高亮。用 IntersectionObserver 而不是 scroll 事件：后者在长文档上每帧都要
  // 跑一遍 getBoundingClientRect，滚起来发涩。
  const links = new Map(
    [...toc.querySelectorAll("a")].map((a) => [a.getAttribute("href").slice(1), a]),
  );
  const visible = new Set();
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) visible.add(e.target.id);
        else visible.delete(e.target.id);
      }
      const first = heads.find((h) => visible.has(h.id));
      for (const a of links.values()) a.classList.remove("on");
      if (first) links.get(first.id)?.classList.add("on");
    },
    { rootMargin: "-72px 0px -70% 0px" },
  );
  heads.forEach((h) => io.observe(h));

  if (location.hash) {
    document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
  }
}

main();
