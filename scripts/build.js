const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

const modules = [
  { id: "vocabulary", label: "词汇", heading: "词汇模块" },
  { id: "grammar", label: "语法", heading: "语法模块" },
  { id: "expression", label: "表达", heading: "表达模块" },
  { id: "quiz", label: "测试题", heading: "测试题模块" },
];

const moduleNameMap = new Map(modules.map((module) => [module.label, module]));

const markdownFiles = fs
  .readdirSync(root)
  .filter((file) => {
    const lowerFile = file.toLowerCase();
    return lowerFile.endsWith(".md") && lowerFile !== "readme.md" && lowerFile !== "agents.md";
  })
  .sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function slugify(value, index) {
  const slug = value
    .toLowerCase()
    .replace(/<[^>]*>/g, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "");

  return slug || `section-${index}`;
}

function renderInline(value) {
  let html = escapeHtml(value);
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return html;
}

function isTableSeparator(line) {
  return /^\s*\|?[\s:|-]+\|[\s:|-]+\|?\s*$/.test(line);
}

function splitTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function renderTable(lines, start) {
  const header = splitTableRow(lines[start]);
  const rows = [];
  let i = start + 2;

  while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
    rows.push(splitTableRow(lines[i]));
    i += 1;
  }

  const thead = `<thead><tr>${header
    .map((cell) => `<th>${renderInline(cell)}</th>`)
    .join("")}</tr></thead>`;
  const tbody = rows.length
    ? `<tbody>${rows
        .map(
          (row) =>
            `<tr>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join("")}</tr>`
        )
        .join("")}</tbody>`
    : "";

  return {
    html: `<div class="table-wrap"><table>${thead}${tbody}</table></div>`,
    next: i,
  };
}

function renderMarkdown(markdown, idPrefix = "") {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html = [];
  const toc = [];
  let i = 0;
  let sectionIndex = 0;

  function closeParagraph(paragraph) {
    if (paragraph.length) {
      html.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
      paragraph.length = 0;
    }
  }

  const paragraph = [];

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      closeParagraph(paragraph);
      i += 1;
      continue;
    }

    if (/^---+$/.test(trimmed)) {
      closeParagraph(paragraph);
      html.push("<hr>");
      i += 1;
      continue;
    }

    if (/^#{1,6}\s+/.test(trimmed)) {
      closeParagraph(paragraph);
      const level = trimmed.match(/^#+/)[0].length;
      const text = trimmed.replace(/^#{1,6}\s+/, "");
      const id = `${idPrefix}${slugify(text, sectionIndex)}`;
      sectionIndex += 1;
      toc.push({ level, text: text.replace(/<[^>]*>/g, ""), id });
      html.push(`<h${level} id="${id}">${renderInline(text)}</h${level}>`);
      i += 1;
      continue;
    }

    if (trimmed.startsWith(">")) {
      closeParagraph(paragraph);
      const quote = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quote.push(lines[i].trim().replace(/^>\s?/, ""));
        i += 1;
      }
      html.push(`<blockquote>${quote.map(renderInline).join("<br>")}</blockquote>`);
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      closeParagraph(paragraph);
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i += 1;
      }
      html.push(`<ul>${items.map((item) => `<li>${renderInline(item)}</li>`).join("")}</ul>`);
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      closeParagraph(paragraph);
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i += 1;
      }
      html.push(`<ol>${items.map((item) => `<li>${renderInline(item)}</li>`).join("")}</ol>`);
      continue;
    }

    if (
      i + 1 < lines.length &&
      /^\s*\|.*\|\s*$/.test(line) &&
      isTableSeparator(lines[i + 1])
    ) {
      closeParagraph(paragraph);
      const table = renderTable(lines, i);
      html.push(table.html);
      i = table.next;
      continue;
    }

    paragraph.push(trimmed);
    i += 1;
  }

  closeParagraph(paragraph);
  return { body: html.join("\n"), toc };
}

function getDateParts(file) {
  const match = file.match(/^(\d{2})(\d{2})/);
  if (!match) {
    return { value: "undated", label: "未标日期", shortLabel: "Note" };
  }

  const [, month, day] = match;
  return {
    value: `2026-${month}-${day}`,
    label: `2026-${month}-${day}`,
    shortLabel: `${month}/${day}`,
  };
}

function normalizeModuleName(value) {
  return value.replace(/[：:]\s*.*$/, "").trim();
}

function parseNote(file, index) {
  const markdown = fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n");
  const lines = markdown.split("\n");
  const titleLine = lines.find((line) => /^#\s+/.test(line.trim()));
  const title = titleLine ? titleLine.trim().replace(/^#\s+/, "") : file.replace(/\.md$/i, "");
  const date = getDateParts(file);
  const moduleBuckets = new Map(modules.map((module) => [module.id, []]));
  let currentModule = null;

  for (const line of lines) {
    const moduleMatch = line.match(/^##\s+(.+?)\s*$/);
    if (moduleMatch) {
      const moduleName = normalizeModuleName(moduleMatch[1]);
      currentModule = moduleNameMap.get(moduleName)?.id || null;
      continue;
    }

    if (currentModule) {
      moduleBuckets.get(currentModule).push(line);
    }
  }

  const entries = modules
    .map((module) => {
      const content = moduleBuckets.get(module.id).join("\n").trim();
      if (!content) return null;
      const rendered = renderMarkdown(content, `${module.id}-${index}-`);

      return {
        ...module,
        body: rendered.body,
        date,
        file,
        index,
        title,
        toc: rendered.toc,
      };
    })
    .filter(Boolean);

  return { date, entries, file, index, title };
}

const notes = markdownFiles.map(parseNote);
const entries = notes.flatMap((note) => note.entries);
const generatedAt = new Date().toISOString().slice(0, 10);

const dateOptions = [
  `<option value="all">全部日期</option>`,
  ...[...new Map(notes.map((note) => [note.date.value, note.date])).values()].map(
    (date) => `<option value="${escapeHtml(date.value)}">${escapeHtml(date.label)}</option>`
  ),
].join("");

const filterButtons = [
  `<button class="filter-button is-active" type="button" data-module-filter="all">全部</button>`,
  ...modules.map(
    (module) =>
      `<button class="filter-button" type="button" data-module-filter="${module.id}">${module.label}</button>`
  ),
].join("");

const sourceNavigation = notes
  .map(
    (note) => {
      const firstEntry = note.entries[0];
      const href = firstEntry ? `#source-${note.index}-${firstEntry.id}` : "#";
      return `<a href="${href}"><span>${escapeHtml(note.date.shortLabel)}</span>${escapeHtml(
        note.title
      )}</a>`;
    }
  )
  .join("");

function renderEntry(entry) {
  const toc = entry.toc
    .filter((item) => item.level >= 3 && item.level <= 4)
    .map((item) => `<a class="level-${item.level}" href="#${item.id}">${escapeHtml(item.text)}</a>`)
    .join("");

  return `<article class="module-card" data-module="${entry.id}" data-date="${escapeHtml(
    entry.date.value
  )}" id="source-${entry.index}-${entry.id}">
    <header class="module-card-header">
      <p class="kicker">${escapeHtml(entry.date.label)} · ${escapeHtml(entry.file)}</p>
      <h3>${escapeHtml(entry.title)}</h3>
      <span>${escapeHtml(entry.label)}</span>
    </header>
    ${toc ? `<nav class="toc compact" aria-label="${escapeHtml(entry.title)} ${escapeHtml(entry.label)}目录">${toc}</nav>` : ""}
    <div class="markdown-body">
      ${entry.body}
    </div>
  </article>`;
}

const moduleSections = modules
  .map((module) => {
    const moduleEntries = entries.filter((entry) => entry.id === module.id);
    return `<section class="module-section" data-module-section="${module.id}" id="${module.id}">
      <header class="section-header">
        <p class="kicker">${moduleEntries.length} 个内容块</p>
        <h2>${escapeHtml(module.heading)}</h2>
      </header>
      <div class="module-grid">
        ${moduleEntries.map(renderEntry).join("\n") || `<p class="empty-inline">暂无内容。</p>`}
      </div>
    </section>`;
  })
  .join("\n");

const page = `<!doctype html>
<html lang="zh-Hans">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Deutsch Learning Platform</title>
  <meta name="description" content="German A1 notes organized by vocabulary, grammar, expressions, and quizzes.">
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f3ec;
      --ink: #202124;
      --muted: #64615a;
      --line: #ded8cb;
      --panel: #fffdf8;
      --accent: #a83232;
      --accent-2: #0f6b5f;
      --table: #f1ede4;
      --chip: #e8f1ee;
      --chip-active: #173f39;
      --shadow: 0 16px 42px rgba(48, 42, 32, 0.09);
    }

    * {
      box-sizing: border-box;
    }

    html {
      scroll-behavior: smooth;
    }

    body {
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", sans-serif;
      line-height: 1.7;
    }

    a {
      color: inherit;
    }

    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }

    .hero {
      min-height: 42vh;
      display: grid;
      align-items: end;
      background:
        linear-gradient(180deg, rgba(18, 23, 28, 0.12), rgba(18, 23, 28, 0.76)),
        url("https://images.unsplash.com/photo-1467269204594-9661b134dd2b?auto=format&fit=crop&w=1800&q=80") center/cover;
      color: #fff;
    }

    .hero-inner,
    main,
    .footer-inner {
      width: min(1180px, calc(100% - 32px));
      margin: 0 auto;
    }

    .hero-inner {
      padding: 70px 0 38px;
    }

    .eyebrow {
      margin: 0 0 12px;
      color: rgba(255, 255, 255, 0.82);
      font-size: 0.88rem;
      font-weight: 800;
      text-transform: uppercase;
    }

    h1 {
      max-width: 900px;
      margin: 0;
      font-size: clamp(2.35rem, 5vw, 5rem);
      line-height: 1;
      letter-spacing: 0;
    }

    .hero p:last-child {
      max-width: 720px;
      margin: 20px 0 0;
      color: rgba(255, 255, 255, 0.9);
      font-size: 1.05rem;
    }

    main {
      padding: 26px 0 72px;
    }

    .topbar {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 16px;
      align-items: center;
      padding: 18px 0 26px;
    }

    .source-nav {
      display: flex;
      gap: 10px;
      overflow-x: auto;
      padding-bottom: 4px;
    }

    .source-nav a {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-height: 42px;
      padding: 9px 13px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: rgba(255, 253, 248, 0.8);
      color: var(--ink);
      text-decoration: none;
      white-space: nowrap;
    }

    .source-nav span {
      color: var(--accent);
      font-weight: 800;
    }

    .updated {
      color: var(--muted);
      font-size: 0.92rem;
      white-space: nowrap;
    }

    .filters {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 14px;
      align-items: center;
      padding: 0 0 28px;
      border-bottom: 1px solid var(--line);
      margin-bottom: 28px;
    }

    .filter-group {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .filter-button,
    .date-filter {
      min-height: 40px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      color: var(--ink);
      font: inherit;
    }

    .filter-button {
      padding: 7px 13px;
      cursor: pointer;
    }

    .filter-button.is-active {
      border-color: var(--chip-active);
      background: var(--chip-active);
      color: #fff;
    }

    .date-filter {
      padding: 7px 32px 7px 12px;
    }

    .module-section {
      margin-top: 34px;
    }

    .module-section[hidden],
    .module-card[hidden] {
      display: none;
    }

    .section-header {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 16px;
      align-items: end;
      margin-bottom: 14px;
    }

    .section-header h2 {
      margin: 0;
      font-size: clamp(1.55rem, 3vw, 2.35rem);
      line-height: 1.15;
      letter-spacing: 0;
    }

    .kicker {
      margin: 0 0 8px;
      color: var(--accent-2);
      font-size: 0.9rem;
      font-weight: 800;
    }

    .module-grid {
      display: grid;
      gap: 18px;
    }

    .module-card {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      box-shadow: var(--shadow);
      padding: clamp(20px, 3vw, 34px);
    }

    .module-card-header {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 12px;
      align-items: start;
      border-bottom: 1px solid var(--line);
      padding-bottom: 18px;
      margin-bottom: 20px;
    }

    .module-card-header h3 {
      grid-column: 1;
      margin: 0;
      font-size: clamp(1.25rem, 2vw, 1.8rem);
      line-height: 1.2;
      letter-spacing: 0;
    }

    .module-card-header span {
      grid-row: 1 / span 2;
      grid-column: 2;
      align-self: center;
      min-height: 30px;
      padding: 4px 10px;
      border-radius: 999px;
      background: var(--chip);
      color: var(--accent-2);
      font-size: 0.9rem;
      font-weight: 800;
      white-space: nowrap;
    }

    .toc {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
      gap: 8px 14px;
      padding: 14px;
      margin-bottom: 24px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #f8f3e9;
    }

    .toc a {
      color: var(--muted);
      font-size: 0.93rem;
      text-decoration: none;
    }

    .toc .level-4 {
      padding-left: 14px;
    }

    .markdown-body h3,
    .markdown-body h4,
    .markdown-body h5 {
      color: #191b1d;
      line-height: 1.25;
      letter-spacing: 0;
    }

    .markdown-body h3 {
      margin: 28px 0 10px;
      font-size: 1.28rem;
    }

    .markdown-body h3:first-child {
      margin-top: 0;
    }

    .markdown-body h4 {
      margin: 22px 0 8px;
      font-size: 1.08rem;
    }

    .markdown-body p,
    .markdown-body ul,
    .markdown-body ol,
    .markdown-body blockquote {
      margin: 0 0 16px;
    }

    .markdown-body ul,
    .markdown-body ol {
      padding-left: 1.45rem;
    }

    blockquote {
      border-left: 4px solid var(--accent);
      background: #fff5ec;
      padding: 14px 16px;
      border-radius: 0 8px 8px 0;
      color: #443b32;
    }

    code {
      padding: 0.15em 0.35em;
      border-radius: 6px;
      background: #eee7d9;
      font-family: "Cascadia Code", Consolas, monospace;
      font-size: 0.92em;
    }

    hr {
      height: 1px;
      border: 0;
      background: var(--line);
      margin: 28px 0;
    }

    .table-wrap {
      width: 100%;
      overflow-x: auto;
      margin: 18px 0 24px;
      border: 1px solid var(--line);
      border-radius: 8px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      min-width: 680px;
      background: #fff;
    }

    th,
    td {
      padding: 11px 13px;
      border-bottom: 1px solid var(--line);
      border-right: 1px solid var(--line);
      text-align: left;
      vertical-align: top;
    }

    th {
      background: var(--table);
      color: #292621;
      font-weight: 800;
    }

    tr:last-child td {
      border-bottom: 0;
    }

    th:last-child,
    td:last-child {
      border-right: 0;
    }

    .empty-state,
    .empty-inline {
      padding: 28px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      color: var(--muted);
      text-align: center;
    }

    .empty-state {
      display: none;
      margin-top: 24px;
    }

    .empty-state.is-visible {
      display: block;
    }

    footer {
      border-top: 1px solid var(--line);
      padding: 24px 0;
      color: var(--muted);
      background: #ede8dd;
    }

    @media (max-width: 720px) {
      .hero {
        min-height: 46vh;
      }

      .topbar,
      .filters,
      .section-header,
      .module-card-header {
        grid-template-columns: 1fr;
      }

      .module-card-header span {
        grid-column: 1;
        grid-row: auto;
        justify-self: start;
      }

      .date-filter {
        width: 100%;
      }

      .updated {
        white-space: normal;
      }

      .module-card {
        padding: 20px 16px;
      }

      table {
        min-width: 620px;
      }
    }
  </style>
</head>
<body>
  <header class="hero">
    <div class="hero-inner">
      <p class="eyebrow">Deutsch A1 Notes</p>
      <h1>Deutsch Learning Platform</h1>
      <p>Vocabulary, grammar, expressions, and quizzes collected from dated German study notes.</p>
    </div>
  </header>

  <main>
    <section class="topbar" aria-label="Notes navigation">
      <nav class="source-nav">${sourceNavigation || "<span>No notes found</span>"}</nav>
      <div class="updated">Updated ${generatedAt}</div>
    </section>

    <section class="filters" aria-label="Filter notes">
      <div class="filter-group" role="group" aria-label="按模块筛选">${filterButtons}</div>
      <label>
        <span class="sr-only">按日期筛选</span>
        <select class="date-filter" aria-label="按日期筛选">
          ${dateOptions}
        </select>
      </label>
    </section>

    ${moduleSections || "<p>No Markdown notes found.</p>"}
    <p class="empty-state">没有匹配当前筛选条件的内容。</p>
  </main>

  <footer>
    <div class="footer-inner">Built from Markdown notes for GitHub Pages.</div>
  </footer>
  <script>
    const filterButtons = [...document.querySelectorAll("[data-module-filter]")];
    const dateFilter = document.querySelector(".date-filter");
    const moduleCards = [...document.querySelectorAll(".module-card")];
    const moduleSections = [...document.querySelectorAll("[data-module-section]")];
    const emptyState = document.querySelector(".empty-state");
    let activeModule = "all";

    function applyFilters() {
      const activeDate = dateFilter.value;
      let visibleCount = 0;

      moduleCards.forEach((card) => {
        const matchesModule = activeModule === "all" || card.dataset.module === activeModule;
        const matchesDate = activeDate === "all" || card.dataset.date === activeDate;
        const isVisible = matchesModule && matchesDate;
        card.hidden = !isVisible;
        if (isVisible) visibleCount += 1;
      });

      moduleSections.forEach((section) => {
        const visibleCards = section.querySelectorAll(".module-card:not([hidden])").length;
        section.hidden = visibleCards === 0;
      });

      emptyState.classList.toggle("is-visible", visibleCount === 0);
    }

    filterButtons.forEach((button) => {
      button.addEventListener("click", () => {
        activeModule = button.dataset.moduleFilter;
        filterButtons.forEach((item) => item.classList.toggle("is-active", item === button));
        applyFilters();
      });
    });

    dateFilter.addEventListener("change", applyFilters);
  </script>
</body>
</html>
`;

fs.writeFileSync(path.join(root, "index.html"), page, "utf8");
console.log(`Built index.html from ${notes.length} Markdown file(s), ${entries.length} module block(s).`);
