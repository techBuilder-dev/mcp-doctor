# MCP Doctor

A free, 100% client-side MCP config validator. Paste your `claude_desktop_config.json` or `.cursor/mcp.json` and get instant diagnostics — or drag the file straight onto the page.

**Zero backend. Zero signup. Zero data sent anywhere.**

---

## What it checks

| Rule | Severity |
|------|----------|
| Invalid JSON (with parse-error hints: trailing commas, Windows backslashes) | Error |
| Missing top-level `mcpServers` key | Error |
| `mcpServers` is an array instead of an object | Error |
| Server is not a valid object | Error |
| Server missing `command` or `url` | Error |
| `args` is not an array | Error |
| `env` is not an object | Error |
| Duplicate server names (detected in raw text, before `JSON.parse` dedupes) | Error |
| Deprecated SSE transport | Error |
| filesystem server missing directory path | Error |
| Windows path with unescaped backslashes | Error |
| URL ending in `/sse` (legacy pattern) | Warning |
| Empty env vars (key exists, value is `""`) | Warning |
| `npx` without `-y` (silent TTY hang) | Warning |
| Remote server over plain `http://` (eavesdropping risk) | Warning |
| Path uses `~` (no shell expansion in subprocess) | Warning |
| Package-name typo (close to a known MCP server) | Warning |
| Active server count may exceed Cursor's ~40 tool ceiling | Warning |
| Server marked `disabled: true` | Info |
| Known server missing its usual required env key | Info |
| `uvx` command — uv install reminder | Info |
| `node` without full path (Claude Desktop + nvm) | Info |
| `docker` command — Docker Desktop reminder | Info |
| `python -m` — venv/environment reminder | Info |
| Config references a `version` / `$schema` field | Info |

Full explanations with anchors at [rules.html](rules.html).

---

## Features

- **Drag & drop** a config file, or use **Load file** / **Load example**
- **Auto-check** — live, debounced validation as you type (toggleable)
- **Line-number gutter** with error/warning markers (click a marked number to jump)
- **One-click Auto-fix** — generates a corrected config (adds `-y`, fills env placeholders, SSE→HTTP, `/sse`→`/mcp`, `http`→`https`, tilde→absolute, filesystem path) with apply/copy
- **Server registry awareness** — flags package-name typos and missing required API keys
- **Health score ring** + FAIL/WARN/OK diagnosis
- **Filter tabs** — All / Errors / Warnings / Info, plus expand/collapse all
- **Per-snippet copy** on every fix code block
- **Copy as Markdown** report (for GitHub issues / Discord)
- **Copy config with placeholders** — fills empty env vars with `YOUR_VALUE_HERE`
- **Download HTML report** — self-contained, shareable
- **Share link** — encodes the config into a URL hash (still 100% client-side)
- **Copy test command** — per server, a ready-to-run terminal command to test it
- **Compare two configs** — before/after diff (added/removed/changed servers, fixed issues, new regressions)
- **Per-OS profile** — macOS/Windows/Linux tailors PATH/path warnings
- **Local storage** — restores your last config on reload
- **"Where's my config?"** helper with OS-specific paths
- **Keyboard shortcuts** — `Ctrl/Cmd+Enter` validate, `Ctrl/Cmd+K` clear, `Ctrl/Cmd+E` expand all, `Esc` close, `?` help

A **VS Code / Cursor extension** with the same checks lives in [`extension/`](extension/README.md).

---

## Deploy to Cloudflare Pages (free, ~5 mins)

### Option A — Direct upload

1. Go to [pages.cloudflare.com](https://pages.cloudflare.com)
2. Create a new project → **Upload assets**
3. Drag the `mcp-doctor/` folder
4. Deploy — you get `your-project.pages.dev`

No build step needed.

### Option B — GitHub + auto-deploy

```bash
git init && git add . && git commit -m "init: mcp doctor"
gh repo create mcp-doctor --public --push
# In Cloudflare Pages: connect repo, leave build command empty, output dir "/"
```

---

## Local dev

```bash
python3 -m http.server 8080   # then open localhost:8080
# or: npx serve .
```

---

## File structure

```
mcp-doctor/
├── index.html     ← entire app (self-contained, vanilla JS/HTML/CSS)
├── rules.html     ← SEO-friendly rule reference (deep-linkable anchors)
├── _headers       ← Cloudflare security headers (CSP, etc.)
├── README.md
└── extension/     ← VS Code / Cursor extension (shares the rule engine)
    ├── package.json
    ├── extension.js
    ├── validator.js
    └── README.md
```

---

## Notes

- Fonts: uses **JetBrains Mono** (Google Fonts) with `Berkeley Mono` as a local-first fallback for users who own it, and **Syne** for display. The `_headers` CSP allows `fonts.googleapis.com` (CSS) and `fonts.gstatic.com` + `self` (font files).
- Duplicate server names are detected by scanning the raw text **before** `JSON.parse`, because `JSON.parse` silently keeps only the last duplicate key.

---

## Extending it

Add validation rules in the `validate()` function in `index.html`. Each rule pushes:

```js
issues.push({
  type: 'error' | 'warning' | 'info',
  rule: 'unique-rule-id',
  title: 'Short title shown in the card',
  server: 'server-name-or-null',
  desc: 'What is wrong and why it matters',
  fix: 'Plain-English fix instruction',
  code: 'Example corrected JSON snippet'  // or null
});
```
