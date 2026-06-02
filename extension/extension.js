'use strict';

const vscode = require('vscode');
const { validate } = require('./validator');

const SEVERITY = {
  error: vscode.DiagnosticSeverity.Error,
  warning: vscode.DiagnosticSeverity.Warning,
  info: vscode.DiagnosticSeverity.Information
};

let collection;

function isMcpConfig(doc) {
  if (!doc) return false;
  const name = doc.fileName.replace(/\\/g, '/').split('/').pop().toLowerCase();
  return name === 'claude_desktop_config.json' || name === 'mcp.json';
}

function fileTypeFor(doc) {
  const name = doc.fileName.replace(/\\/g, '/').split('/').pop().toLowerCase();
  return name === 'mcp.json' ? 'cursor' : 'claude';
}

function rangeForLine(doc, line) {
  const idx = Math.max(0, (line || 1) - 1);
  const textLine = idx < doc.lineCount ? doc.lineAt(idx) : doc.lineAt(0);
  return new vscode.Range(textLine.range.start, textLine.range.end);
}

function runOn(doc) {
  if (!collection || !isMcpConfig(doc)) return;
  const cfg = vscode.workspace.getConfiguration('mcpDoctor');
  const result = validate(doc.getText(), { fileType: fileTypeFor(doc), targetOS: cfg.get('targetOS', 'auto') });

  const diags = [];
  if (result.parseError) {
    diags.push(new vscode.Diagnostic(rangeForLine(doc, 1), 'MCP Doctor: invalid JSON — ' + result.parseError, vscode.DiagnosticSeverity.Error));
  } else {
    result.issues.forEach(issue => {
      const d = new vscode.Diagnostic(rangeForLine(doc, issue.line), issue.title + ' — ' + issue.fix, SEVERITY[issue.type]);
      d.source = 'MCP Doctor';
      d.code = issue.rule;
      diags.push(d);
    });
  }
  collection.set(doc.uri, diags);
}

function activate(context) {
  collection = vscode.languages.createDiagnosticCollection('mcpDoctor');
  context.subscriptions.push(collection);

  const cfg = () => vscode.workspace.getConfiguration('mcpDoctor');

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(runOn),
    vscode.workspace.onDidChangeTextDocument(e => runOn(e.document)),
    vscode.workspace.onDidSaveTextDocument(doc => { if (cfg().get('validateOnSave', true)) runOn(doc); }),
    vscode.workspace.onDidCloseTextDocument(doc => collection.delete(doc.uri)),
    vscode.commands.registerCommand('mcpDoctor.validate', () => {
      const ed = vscode.window.activeTextEditor;
      if (!ed) { vscode.window.showInformationMessage('Open an MCP config file first.'); return; }
      runOn(ed.document);
      const n = (collection.get(ed.document.uri) || []).length;
      vscode.window.showInformationMessage('MCP Doctor: ' + (n ? n + ' issue(s) found — see Problems panel.' : 'no issues found.'));
    })
  );

  // Validate any already-open MCP config files on activation.
  vscode.workspace.textDocuments.forEach(runOn);
}

function deactivate() { if (collection) collection.dispose(); }

module.exports = { activate, deactivate };
