const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

const markdownFiles = fs
  .readdirSync(root)
  .filter((file) => file.toLowerCase().endsWith(".md") && file !== "README.md")
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

function renderMarkdown(markdown) {
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
      const id = slugify(text, sectionIndex);
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

function renderNote(file, index) {
  const markdown = fs.readFileSync(path.join(root, file), "utf8");
  const { body, toc } = renderMarkdown(markdown);
  const title = toc.find((item) => item.level === 1)?.text || file.replace(/\.md$/i, "");
  const dateLabel = file.match(/^(\d{2})(\d{2})/)?.slice(1, 3).join("/") || "Note";

  return { body, file, index, title, dateLabel, toc };
}

const notes = markdownFiles.map(renderNote);

const navigation = notes
  .map(
    (note) =>
      `<a href="#note-${note.index}"><span>${escapeHtml(note.dateLabel)}</span>${escapeHtml(
        note.title
      )}</a>`
  )
  .join("");

const noteSections = notes
  .map((note) => {
    const toc = note.toc
      .filter((item) => item.level > 1 && item.level <= 3)
      .map(
        (item) =>
          `<a class="level-${item.level}" href="#${item.id}">${escapeHtml(item.text)}</a>`
      )
      .join("");
    return `<article class="note" id="note-${note.index}">
      <header class="note-header">
        <p class="kicker">${escapeHtml(note.file)}</p>
        <h2>${escapeHtml(note.title)}</h2>
      </header>
      ${toc ? `<nav class="toc" aria-label="${escapeHtml(note.title)} table of contents">${toc}</nav>` : ""}
      <div class="markdown-body">
        ${note.body.replace(/<h1[^>]*>.*?<\/h1>\n?/s, "")}
      </div>
    </article>`;
  })
  .join("\n");

const generatedAt = new Date().toISOString().slice(0, 10);

const page = `<!doctype html>
<html lang="zh-Hans">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Deutsch Learning Platform</title>
  <meta name="description" content="German A1 grammar notes and learning references.">
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f5ef;
      --ink: #202124;
      --muted: #64615a;
      --line: #ded8cb;
      --panel: #fffdf8;
      --accent: #ba2d2d;
      --accent-2: #0f6b5f;
      --table: #f1ede4;
      --shadow: 0 18px 50px rgba(48, 42, 32, 0.1);
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

    .hero {
      min-height: 58vh;
      display: grid;
      align-items: end;
      background:
        linear-gradient(180deg, rgba(18, 23, 28, 0.16), rgba(18, 23, 28, 0.74)),
        url("https://images.unsplash.com/photo-1467269204594-9661b134dd2b?auto=format&fit=crop&w=1800&q=80") center/cover;
      color: #fff;
    }

    .hero-inner,
    main,
    .footer-inner {
      width: min(1120px, calc(100% - 32px));
      margin: 0 auto;
    }

    .hero-inner {
      padding: 76px 0 44px;
    }

    .eyebrow {
      margin: 0 0 12px;
      color: rgba(255, 255, 255, 0.82);
      font-size: 0.88rem;
      font-weight: 700;
      text-transform: uppercase;
    }

    h1 {
      max-width: 900px;
      margin: 0;
      font-size: clamp(2.45rem, 6vw, 5.9rem);
      line-height: 1;
      letter-spacing: 0;
    }

    .hero p:last-child {
      max-width: 680px;
      margin: 22px 0 0;
      color: rgba(255, 255, 255, 0.9);
      font-size: 1.08rem;
    }

    main {
      padding: 28px 0 72px;
    }

    .topbar {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 16px;
      align-items: center;
      padding: 20px 0 32px;
    }

    .note-nav {
      display: flex;
      gap: 10px;
      overflow-x: auto;
      padding-bottom: 4px;
    }

    .note-nav a,
    .resource-links a {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-height: 42px;
      padding: 9px 13px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: rgba(255, 253, 248, 0.78);
      color: var(--ink);
      text-decoration: none;
      white-space: nowrap;
    }

    .note-nav span {
      color: var(--accent);
      font-weight: 800;
    }

    .updated {
      color: var(--muted);
      font-size: 0.92rem;
      white-space: nowrap;
    }

    .resources {
      border-top: 1px solid var(--line);
      border-bottom: 1px solid var(--line);
      padding: 18px 0;
      margin-bottom: 30px;
    }

    .resources h2 {
      margin: 0 0 12px;
      font-size: 1rem;
      text-transform: uppercase;
      color: var(--muted);
    }

    .resource-links {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }

    .note {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      box-shadow: var(--shadow);
      padding: clamp(22px, 4vw, 48px);
    }

    .note + .note {
      margin-top: 28px;
    }

    .note-header {
      border-bottom: 1px solid var(--line);
      padding-bottom: 22px;
      margin-bottom: 24px;
    }

    .kicker {
      margin: 0 0 8px;
      color: var(--accent-2);
      font-size: 0.92rem;
      font-weight: 800;
    }

    .note-header h2 {
      margin: 0;
      font-size: clamp(1.65rem, 3vw, 2.7rem);
      line-height: 1.15;
      letter-spacing: 0;
    }

    .toc {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
      gap: 8px 14px;
      padding: 16px;
      margin-bottom: 32px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #f8f3e9;
    }

    .toc a {
      color: var(--muted);
      font-size: 0.94rem;
      text-decoration: none;
    }

    .toc .level-3 {
      padding-left: 14px;
    }

    .markdown-body h2,
    .markdown-body h3,
    .markdown-body h4 {
      color: #191b1d;
      line-height: 1.25;
      letter-spacing: 0;
    }

    .markdown-body h2 {
      margin: 38px 0 14px;
      font-size: 1.65rem;
      border-top: 1px solid var(--line);
      padding-top: 28px;
    }

    .markdown-body h2:first-child {
      border-top: 0;
      padding-top: 0;
    }

    .markdown-body h3 {
      margin: 28px 0 10px;
      font-size: 1.28rem;
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

    footer {
      border-top: 1px solid var(--line);
      padding: 24px 0;
      color: var(--muted);
      background: #ede8dd;
    }

    @media (max-width: 720px) {
      .hero {
        min-height: 50vh;
      }

      .topbar {
        grid-template-columns: 1fr;
      }

      .updated {
        white-space: normal;
      }

      .note {
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
      <p>German grammar notes organized for quick review, with examples, declension tables, and Perfekt patterns.</p>
    </div>
  </header>

  <main>
    <section class="topbar" aria-label="Notes navigation">
      <nav class="note-nav">${navigation || "<span>No notes found</span>"}</nav>
      <div class="updated">Updated ${generatedAt}</div>
    </section>

    ${noteSections || "<p>No Markdown notes found.</p>"}
  </main>

  <footer>
    <div class="footer-inner">Built from Markdown notes for GitHub Pages.</div>
  </footer>
</body>
</html>
`;

fs.writeFileSync(path.join(root, "index.html"), page, "utf8");
console.log(`Built index.html from ${notes.length} Markdown file(s).`);
