'use strict';

// Pure, DOM-free MCP config validator — shared core for the VS Code extension.
// Mirrors the rule set used by the MCP Doctor web app.

const KNOWN_SERVERS = {
  'server-filesystem': { env: [] },
  'server-github': { env: ['GITHUB_PERSONAL_ACCESS_TOKEN'] },
  'server-gitlab': { env: ['GITLAB_PERSONAL_ACCESS_TOKEN'] },
  'server-slack': { env: ['SLACK_BOT_TOKEN', 'SLACK_TEAM_ID'] },
  'server-brave-search': { env: ['BRAVE_API_KEY'] },
  'server-google-maps': { env: ['GOOGLE_MAPS_API_KEY'] },
  'server-postgres': { env: [] },
  'server-sqlite': { env: [] },
  'server-puppeteer': { env: [] },
  'server-memory': { env: [] },
  'server-sequential-thinking': { env: [] },
  'server-everything': { env: [] },
  'server-sentry': { env: ['SENTRY_AUTH_TOKEN'] },
  'server-everart': { env: ['EVERART_API_KEY'] },
  'mcp-server-fetch': { env: [] },
  'mcp-server-time': { env: [] },
  'mcp-server-git': { env: [] }
};
const KNOWN_NAMES = Object.keys(KNOWN_SERVERS);

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
    dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

function extractPackage(args) {
  if (!Array.isArray(args)) return null;
  for (const a of args) {
    if (typeof a !== 'string' || a === '-y' || a.startsWith('-')) continue;
    const m = a.match(/(?:^|\/)((?:mcp-)?server-[a-z0-9-]+)$/i) || a.match(/^((?:mcp-)?server-[a-z0-9-]+)/i);
    if (m) return m[1].toLowerCase();
    if (/^(@[\w-]+\/)?[\w.-]+$/.test(a) && (a.includes('server') || a.includes('mcp'))) return a.split('/').pop().toLowerCase();
  }
  return null;
}

function findServerLine(raw, serverName) {
  const lines = raw.split('\n');
  const pattern = '"' + serverName + '"';
  for (let i = 0; i < lines.length; i++) if (lines[i].includes(pattern)) return i + 1;
  return null;
}

function findDuplicateServerKeys(raw) {
  const mcpMatch = raw.match(/"mcpServers"\s*:\s*\{/);
  if (!mcpMatch) return [];
  const startIdx = mcpMatch.index + mcpMatch[0].length;
  let depth = 1, inStr = false, esc = false, collecting = false, current = '';
  const keys = [];
  for (let i = startIdx; i < raw.length && depth > 0; i++) {
    const ch = raw[i];
    if (esc) { if (collecting) current += ch; esc = false; continue; }
    if (ch === '\\' && inStr) { if (collecting) current += ch; esc = true; continue; }
    if (ch === '"') {
      if (!inStr) { inStr = true; if (depth === 1) { collecting = true; current = ''; } }
      else { if (collecting) { let j = i + 1; while (j < raw.length && /\s/.test(raw[j])) j++; if (raw[j] === ':') keys.push(current); collecting = false; } inStr = false; }
      continue;
    }
    if (inStr) { if (collecting) current += ch; continue; }
    if (ch === '{') depth++;
    if (ch === '}') depth--;
  }
  const seen = new Set(), dups = new Set();
  keys.forEach(k => { if (seen.has(k)) dups.add(k); else seen.add(k); });
  return [...dups];
}

function effectiveOS(os) {
  if (os && os !== 'auto') return os;
  const p = process.platform;
  if (p === 'darwin') return 'mac';
  if (p === 'win32') return 'win';
  return 'linux';
}

// Returns { parseError, issues } where each issue has { type, rule, title, desc, fix, server, line }.
function validate(raw, opts) {
  opts = opts || {};
  const fileType = opts.fileType || 'claude';
  const os = effectiveOS(opts.targetOS);
  const issues = [];
  const push = (o) => { o.line = o.server ? findServerLine(raw, o.server) : 1; issues.push(o); };

  findDuplicateServerKeys(raw).forEach(name => push({ type: 'error', rule: 'duplicate-server', server: name,
    title: 'Duplicate server name "' + name + '"', desc: 'One definition silently overwrites the other.', fix: 'Give each server a unique name.' }));

  let parsed;
  try { parsed = JSON.parse(raw); }
  catch (e) {
    let hint = '';
    if (/\\[^"\\/bfnrtu]/.test(raw) && /[A-Za-z]:[\\/]/.test(raw)) hint = ' (likely a Windows path with single backslashes — double them or use forward slashes)';
    else if (/,\s*[}\]]/.test(raw)) hint = ' (likely a trailing comma)';
    return { parseError: e.message + hint, issues };
  }

  if (!parsed.mcpServers) { push({ type: 'error', rule: 'missing-top-level', server: null, title: 'Missing "mcpServers" key', desc: 'The root key all server definitions live under.', fix: 'Wrap servers under "mcpServers".' }); return { parseError: null, issues }; }
  if (typeof parsed.mcpServers !== 'object' || Array.isArray(parsed.mcpServers)) { push({ type: 'error', rule: 'servers-not-object', server: null, title: '"mcpServers" must be an object', desc: 'Use an object keyed by server name, not an array.', fix: 'Use { "name": { ... } }.' }); return { parseError: null, issues }; }

  if (parsed.version || parsed.$schema) push({ type: 'info', rule: 'schema-version-check', server: null, title: 'Config references a schema version', desc: 'Schema versions differ between Claude Desktop and Cursor.', fix: 'Verify it matches your client.' });

  const servers = parsed.mcpServers;
  Object.keys(servers).forEach(name => {
    const s = servers[name];
    if (!s || typeof s !== 'object' || Array.isArray(s)) { push({ type: 'error', rule: 'server-not-object', server: name, title: 'Server "' + name + '" is not a valid object', desc: 'Must be an object with command or url.', fix: 'Make the value an object.' }); return; }
    if (s.disabled === true) { push({ type: 'info', rule: 'disabled-server', server: name, title: '"' + name + '" is disabled', desc: 'Marked disabled: true; will not load.', fix: 'Set disabled: false to enable.' }); return; }

    if (!s.command && !s.url) push({ type: 'error', rule: 'no-command-or-url', server: name, title: '"' + name + '" has no command or url', desc: 'Needs command (stdio) or url (HTTP).', fix: 'Add a command or url.' });
    if (s.args !== undefined && !Array.isArray(s.args)) push({ type: 'error', rule: 'args-not-array', server: name, title: '"' + name + '".args must be an array', desc: 'Even a single arg must be in [ ].', fix: 'Wrap args in brackets.' });
    if (s.env !== undefined && (typeof s.env !== 'object' || Array.isArray(s.env) || s.env === null)) push({ type: 'error', rule: 'env-not-object', server: name, title: '"' + name + '".env must be an object', desc: 'A flat key-value object.', fix: 'Use { "KEY": "value" }.' });
    if (s.transport === 'sse') push({ type: 'error', rule: 'deprecated-sse', server: name, title: '"' + name + '" uses deprecated SSE transport', desc: 'Deprecated in MCP spec 2025-03-26; use Streamable HTTP.', fix: 'Switch to "transport": "http".' });
    if (typeof s.url === 'string' && s.url.endsWith('/sse')) push({ type: 'warning', rule: 'sse-url-pattern', server: name, title: '"' + name + '" URL ends in /sse', desc: 'Likely a legacy SSE endpoint.', fix: 'Use the /mcp endpoint.' });

    if (s.command === 'npx' && Array.isArray(s.args)) {
      const pi = s.args.findIndex(a => typeof a === 'string' && a.includes('server-filesystem'));
      if (pi !== -1) {
        const hasPath = s.args.some((a, i) => i > pi && typeof a === 'string' && (a.startsWith('/') || a.startsWith('~') || /^[A-Za-z]:[\\/]/.test(a)));
        if (!hasPath) push({ type: 'error', rule: 'filesystem-no-path', server: name, title: '"' + name + '": filesystem server missing directory path', desc: 'Requires an allowed directory argument.', fix: 'Add a path after the package name.' });
      }
    }

    if (s.env && typeof s.env === 'object' && !Array.isArray(s.env)) Object.entries(s.env).forEach(([k, v]) => {
      if (v === '' || v === null || v === undefined) push({ type: 'warning', rule: 'empty-env-var', server: name, title: '"' + name + '": ' + k + ' is empty', desc: 'Set but has no value; auth will fail.', fix: 'Set the real value for ' + k + '.' });
    });

    if (s.command === 'uvx') push({ type: 'info', rule: 'uvx-command', server: name, title: '"' + name + '" uses uvx', desc: 'Requires the uv package manager on PATH.', fix: 'Install uv; verify with uvx --version.' });
    if (fileType === 'claude' && s.command === 'node' && os !== 'win') push({ type: 'info', rule: 'node-path-check', server: name, title: '"' + name + '": using bare "node"', desc: 'Client may not inherit nvm/fnm PATH.', fix: 'Use the absolute path to node.' });
    if (s.command === 'npx' && Array.isArray(s.args) && !s.args.includes('-y')) push({ type: 'warning', rule: 'npx-missing-y-flag', server: name, title: '"' + name + '": npx without -y', desc: 'Interactive install prompt hangs in a subprocess.', fix: 'Add "-y" as the first npx arg.' });
    if (typeof s.url === 'string' && s.url.startsWith('http://') && !s.url.includes('localhost') && !s.url.includes('127.0.0.1')) push({ type: 'warning', rule: 'http-url-not-localhost', server: name, title: '"' + name + '": remote server over plain HTTP', desc: 'Exposes traffic to eavesdropping.', fix: 'Use HTTPS.' });
    if (s.command === 'docker') push({ type: 'info', rule: 'docker-command', server: name, title: '"' + name + '": Docker-based server', desc: 'Needs Docker Desktop running.', fix: 'Start Docker before your client.' });
    if ((s.command === 'python' || s.command === 'python3') && Array.isArray(s.args) && s.args.includes('-m')) push({ type: 'info', rule: 'python-module-path', server: name, title: '"' + name + '": Python -m module', desc: 'May pick up the wrong interpreter.', fix: 'Point command at the venv Python.' });

    if (Array.isArray(s.args)) {
      let tilde = false, win = false;
      s.args.forEach(a => {
        if (typeof a !== 'string') return;
        if (!tilde && a.includes('~/')) { tilde = true; push({ type: 'warning', rule: 'path-with-tilde', server: name, title: '"' + name + '": path uses ~', desc: 'Tilde may not expand outside a shell.', fix: 'Use an absolute path.' }); }
        if (!win && /[\x00-\x1f]/.test(a) && /[A-Za-z]:/.test(a)) { win = true; push({ type: 'error', rule: 'windows-path-separators', server: name, title: '"' + name + '": unescaped backslashes in path', desc: 'JSON parses single backslashes as escapes.', fix: 'Double the backslashes or use forward slashes.' }); }
      });
    }

    const pkg = extractPackage(s.args);
    if (pkg) {
      if (!KNOWN_SERVERS[pkg]) {
        let best = null, bestD = 99;
        KNOWN_NAMES.forEach(k => { const d = levenshtein(pkg, k); if (d < bestD) { bestD = d; best = k; } });
        if (best && bestD > 0 && bestD <= 2) push({ type: 'warning', rule: 'package-typo', server: name, title: '"' + name + '": possible package typo "' + pkg + '"', desc: 'Close to "' + best + '". A typo means it never installs.', fix: 'Did you mean "' + best + '"?' });
      } else {
        const present = (s.env && typeof s.env === 'object' && !Array.isArray(s.env)) ? Object.keys(s.env) : [];
        (KNOWN_SERVERS[pkg].env || []).forEach(k => { if (!present.includes(k)) push({ type: 'info', rule: 'missing-required-env', server: name, title: '"' + name + '": ' + pkg + ' usually needs ' + k, desc: 'Typically required to authenticate.', fix: 'Add ' + k + ' to env.' }); });
      }
    }
  });

  const active = Object.values(servers).filter(s => s && typeof s === 'object' && !Array.isArray(s) && s.disabled !== true).length;
  if (active >= 8) push({ type: 'warning', rule: 'tool-count-ceiling', server: null, title: active + ' active servers may exceed Cursor\'s ~40 tool limit', desc: active + ' servers × ~5 tools = ~' + (active * 5) + ' tools; extras are silently dropped.', fix: 'Disable unused servers with "disabled": true.' });

  const order = { error: 0, warning: 1, info: 2 };
  issues.sort((a, b) => order[a.type] - order[b.type]);
  return { parseError: null, issues };
}

module.exports = { validate, findServerLine, KNOWN_SERVERS };
