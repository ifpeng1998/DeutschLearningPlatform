# Project Context

This repository is a static GitHub Pages site for German learning notes. Future agents should keep the site simple: Markdown source files are parsed by `scripts/build.js`, which generates `index.html` in the repository root.

## Note Source Files

- German study notes live as root-level `.md` files.
- Ignore `README.md` when building notes.
- Use UTF-8 for all Markdown files.
- Name dated notes with a leading `MMDD` prefix, for example:
  - `0616语法-介词及现在完成时-deepseek.md`
  - `0625表达-交通与位置-序数词-deepseek.md`
- The current build script derives dates from the leading `MMDD` prefix as `2026-MM-DD`. If notes from another year are added, update `scripts/build.js` before building.

## Required Markdown Structure

Each note must use this exact top-level structure:

```markdown
# 德语 A1 复习笔记：主题

## 词汇

### 小节标题
...

## 语法

### 小节标题
...

## 表达

### 小节标题
...

## 测试题

### 小节标题
...
```

Rules:

- Keep exactly one `#` title at the top.
- Use exactly these four `##` module headings: `词汇`, `语法`, `表达`, `测试题`.
- Do not add other `##` headings unless `scripts/build.js` is updated to understand them.
- Put detailed subsections under `###` or deeper headings.
- A note can have short content in a module, but all four modules should be present for consistent display and filtering.

## Content Organization

- `词汇`: words, nouns, verbs, fixed terms, transport vocabulary, direction/location words, verb forms.
- `语法`: rules, forms, declension, conjugation, word order, cases, tense construction.
- `表达`: practical sentence patterns, Q&A pairs, examples for speaking/writing, common formulaic usage.
- `测试题`: self-check questions, translation prompts, fill-in-the-blank questions, production exercises.

When reorganizing generated or AI-written notes, split mixed content into the four modules instead of keeping a whole lesson bundled as one article.

## Build Rules

- Run the build after editing Markdown or `scripts/build.js`:

```powershell
node scripts/build.js
```

- `npm run build` may be blocked by PowerShell execution policy on this machine; `node scripts/build.js` is the reliable command.
- `index.html` is generated output and should normally be changed through Markdown or `scripts/build.js`, not by manual edits.
- Commit or preserve the generated `index.html` because GitHub Pages serves the static file from the repository root.

## Web Page Behavior

- The generated page groups content by module, not by whole note.
- Each content block keeps its source date and source file.
- Filters should support:
  - module: `全部`, `词汇`, `语法`, `表达`, `测试题`
  - date: all dated notes discovered from filenames
- The site should remain static and GitHub Pages compatible. Do not add a backend, database, or frontend framework unless the project requirements change substantially.

## Verification

After changes:

1. Run `node scripts/build.js`.
2. Confirm the build reports the expected number of Markdown files and module blocks.
3. If browser verification is needed, serve the folder locally with `python -m http.server 8000` and open `http://127.0.0.1:8000/index.html`.
4. Test at least one module filter and one date filter.
5. Stop the temporary local server after verification.
