# MCP Doctor — VS Code / Cursor extension

Inline diagnostics for `claude_desktop_config.json` and `.cursor/mcp.json`, using the same rule set as the [MCP Doctor](../index.html) web app.

## What it does

- Auto-validates any open file named `claude_desktop_config.json` or `mcp.json`
- Shows errors/warnings/info as squiggles in the editor and entries in the **Problems** panel
- Each diagnostic includes the fix and a rule `code` (e.g. `deprecated-sse`)
- Command: **MCP Doctor: Validate Config** (Command Palette)

## Settings

| Setting | Default | Description |
|---|---|---|
| `mcpDoctor.validateOnSave` | `true` | Re-validate on save |
| `mcpDoctor.targetOS` | `auto` | OS for PATH/path-specific warnings (`auto`/`mac`/`win`/`linux`) |

## Develop / run locally

```bash
cd extension
npm install -g @vscode/vsce   # only needed to package
# To debug: open this folder in VS Code and press F5 (Extension Development Host)
```

No build step — it's plain CommonJS. `validator.js` is the pure, DOM-free core (also unit-testable with `node`).

## Package & install

```bash
vsce package          # produces mcp-doctor-1.0.0.vsix
code --install-extension mcp-doctor-1.0.0.vsix
# Cursor: cursor --install-extension mcp-doctor-1.0.0.vsix
```

## Files

```
extension/
├── package.json    ← manifest (activation, command, settings)
├── extension.js    ← VS Code glue: diagnostics + command
├── validator.js    ← pure rule engine (shared with the web app's logic)
└── README.md
```
