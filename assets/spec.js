const elements = {
  toc: document.getElementById("toc"),
  status: document.getElementById("status"),
  content: document.getElementById("content"),
};

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s) {
  return escapeHtml(s);
}

function sanitizeUrl(url) {
  const raw = String(url == null ? "" : url).trim();
  if (!raw) return "#";

  if (raw.startsWith("#") || raw.startsWith("/") || raw.startsWith("./") || raw.startsWith("../")) {
    return raw;
  }

  try {
    const u = new URL(raw, window.location.href);
    if (u.protocol === "http:" || u.protocol === "https:" || u.protocol === "mailto:") return u.href;
  } catch {
    // ignore
  }
  return "#";
}

function inline(raw) {
  const parts = String(raw == null ? "" : raw).split("`");
  const links = [];

  function protectLinks(s) {
    return s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) => {
      const idx = links.length;
      links.push({ text, url });
      return `\uE000${idx}\uE001`;
    });
  }

  function renderText(s) {
    let x = escapeHtml(protectLinks(s));
    x = x.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    x = x.replace(/\uE000(\d+)\uE001/g, (_, idx) => {
      const item = links[Number(idx)];
      if (!item) return "";
      const href = sanitizeUrl(item.url);
      return `<a href="${escapeAttr(href)}" target="_blank" rel="noreferrer">${escapeHtml(item.text)}</a>`;
    });
    return x;
  }

  return parts
    .map((p, i) => {
      if (i % 2 === 1) return `<code>${escapeHtml(p)}</code>`;
      return renderText(p);
    })
    .join("");
}

function headingTextPlain(raw) {
  return String(raw == null ? "" : raw)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/[\*`_#]/g, "")
    .trim();
}

function slugify(raw) {
  const s = headingTextPlain(raw).toLowerCase();
  const slug = s
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\u4e00-\u9fff-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "section";
}

function renderMarkdown(md) {
  const lines = String(md == null ? "" : md).replace(/\r\n/g, "\n").split("\n");

  const html = [];
  const headings = [];
  const usedIds = new Map();

  let para = [];
  let listType = null;
  let listItems = [];
  let inCode = false;
  let codeLang = "";
  let codeBuf = [];
  let inQuote = false;
  let quoteBuf = [];

  function uniqueId(base) {
    const n = (usedIds.has(base) ? usedIds.get(base) : 0) + 1;
    usedIds.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  }

  function flushPara() {
    const text = para.join(" ").trim();
    if (text) html.push(`<p>${inline(text)}</p>`);
    para = [];
  }

  function flushList() {
    if (!listType) return;
    html.push(`<${listType}>${listItems.join("")}</${listType}>`);
    listType = null;
    listItems = [];
  }

  function flushQuote() {
    if (!inQuote) return;
    const text = quoteBuf.join("\n").trim();
    if (text) html.push(`<blockquote><p>${inline(text.replace(/\n/g, " "))}</p></blockquote>`);
    inQuote = false;
    quoteBuf = [];
  }

  function closeAll() {
    flushPara();
    flushList();
    flushQuote();
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (inCode) {
      if (line.startsWith("```")) {
        const lang = codeLang.trim().replace(/[^a-z0-9_-]/gi, "");
        const cls = lang ? ` class="language-${escapeAttr(lang)}"` : "";
        html.push(`<pre><code${cls}>${escapeHtml(codeBuf.join("\n"))}</code></pre>`);
        inCode = false;
        codeLang = "";
        codeBuf = [];
      } else {
        codeBuf.push(line);
      }
      continue;
    }

    if (line.startsWith("```")) {
      closeAll();
      inCode = true;
      codeLang = line.slice(3).trim();
      codeBuf = [];
      continue;
    }

    const hm = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (hm) {
      closeAll();
      const level = hm[1].length;
      const rawText = hm[2];
      const id = uniqueId(slugify(rawText));
      const textPlain = headingTextPlain(rawText);
      headings.push({ level, id, text: textPlain });
      html.push(
        `<h${level} id="${escapeAttr(id)}">${inline(rawText)}<a class="hanchor" href="#${escapeAttr(id)}" aria-label="链接到此标题">#</a></h${level}>`
      );
      continue;
    }

    const qm = line.match(/^>\s?(.*)$/);
    if (qm) {
      flushPara();
      flushList();
      inQuote = true;
      quoteBuf.push(qm[1]);
      continue;
    } else if (inQuote) {
      flushQuote();
    }

    const ulm = line.match(/^\s*[-*]\s+(.+)$/);
    if (ulm) {
      flushPara();
      if (listType && listType !== "ul") flushList();
      listType = "ul";
      listItems.push(`<li>${inline(ulm[1])}</li>`);
      continue;
    }

    const olm = line.match(/^\s*\d+\.\s+(.+)$/);
    if (olm) {
      flushPara();
      if (listType && listType !== "ol") flushList();
      listType = "ol";
      listItems.push(`<li>${inline(olm[1])}</li>`);
      continue;
    }

    if (listType && line.trim() === "") {
      flushList();
    }

    if (line.trim() === "") {
      flushPara();
      continue;
    }

    para.push(line.trim());
  }

  if (inCode) {
    const lang = codeLang.trim().replace(/[^a-z0-9_-]/gi, "");
    const cls = lang ? ` class="language-${escapeAttr(lang)}"` : "";
    html.push(`<pre><code${cls}>${escapeHtml(codeBuf.join("\n"))}</code></pre>`);
  }

  closeAll();

  return { html: html.join("\n"), headings };
}

function renderToc(headings) {
  const filtered = headings.filter(h => h.level >= 2 && h.level <= 4);
  if (filtered.length === 0) return "";
  return filtered
    .map(h => {
      const cls = `toc__link toc__link--l${h.level}`;
      return `<a class="${cls}" href="#${escapeAttr(h.id)}">${escapeHtml(h.text)}</a>`;
    })
    .join("\n");
}

function setupScrollSpy() {
  if (!("IntersectionObserver" in window)) return;

  const links = Array.from(elements.toc.querySelectorAll("a[href^='#']"));
  if (links.length === 0) return;

  const headings = Array.from(elements.content.querySelectorAll("h2[id],h3[id],h4[id]"));
  if (headings.length === 0) return;

  let activeId = null;
  const setActive = (id) => {
    if (!id || id === activeId) return;
    activeId = id;
    for (const a of links) {
      a.classList.toggle("is-active", a.getAttribute("href") === `#${id}`);
    }
  };

  const io = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter(e => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

      if (visible.length > 0) {
        const id = visible[0].target.getAttribute("id");
        setActive(id);
      }
    },
    { rootMargin: "-20% 0px -75% 0px", threshold: [0, 1] }
  );

  for (const h of headings) io.observe(h);

  const hash = decodeURIComponent((location.hash || "").slice(1));
  if (hash) setActive(hash);
}

async function main() {
  try {
    const res = await fetch("SPEC.md", { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const md = await res.text();

    const r = renderMarkdown(md);
    elements.content.innerHTML = r.html;
    elements.toc.innerHTML = renderToc(r.headings);

    elements.status.textContent = `已加载：SPEC.md（${md.length} 字符）`;
    setupScrollSpy();
  } catch (e) {
    elements.status.textContent = "加载失败：请检查 SPEC.md 是否存在。";
    elements.content.textContent = String(e && e.message ? e.message : e);
  }
}

main();
