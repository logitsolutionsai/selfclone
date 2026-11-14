// SARIF 2.1.0 output for lint, for GitHub code scanning and other SARIF viewers.
import { VERSION } from '../util.mjs';

const LEVEL = { error: 'error', warning: 'warning', note: 'note' };

const STYLE_RULES = {
  'style/longer-than-usual': 'Paragraph longer than the writer usually writes',
  'style/exclamation': 'Exclamation mark the writer rarely uses',
  'style/semicolon': 'Semicolon the writer rarely uses',
  'style/emoji': 'Emoji the writer rarely uses',
  'style/dash': 'Dash the writer rarely uses',
  'style/lowercase-start': 'Lowercase start where the writer capitalises',
};

export function toSarif(report, { policy = null } = {}) {
  const ruleMap = new Map();
  for (const r of policy?.rules || []) {
    ruleMap.set(r.id, {
      id: r.id,
      name: r.id,
      shortDescription: { text: r.message },
      defaultConfiguration: { level: LEVEL[r.severity || (r.mode === 'hard' ? 'error' : 'warning')] },
      properties: { kind: 'policy', type: r.type, mode: r.mode },
    });
  }
  for (const f of report.findings) {
    if (!ruleMap.has(f.ruleId)) {
      ruleMap.set(f.ruleId, {
        id: f.ruleId,
        name: f.ruleId,
        shortDescription: { text: STYLE_RULES[f.ruleId] || f.ruleId },
        defaultConfiguration: { level: LEVEL[f.severity] },
        properties: { kind: f.kind },
      });
    }
  }
  const rules = [...ruleMap.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const index = new Map(rules.map((r, i) => [r.id, i]));
  return {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: { driver: { name: 'selfclone', version: VERSION, informationUri: 'https://github.com/logitsolutionsai/selfclone', rules } },
        columnKind: 'utf16CodeUnits',
        results: report.findings.map((f) => ({
          ruleId: f.ruleId,
          ruleIndex: index.get(f.ruleId),
          level: LEVEL[f.severity],
          message: { text: f.suggestion ? `${f.message} ${f.suggestion}` : f.message },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: f.path, uriBaseId: '%SRCROOT%' },
                region: { startLine: f.line, startColumn: f.column, charOffset: f.startOffset, charLength: f.endOffset - f.startOffset },
              },
            },
          ],
          properties: { kind: f.kind, confidence: f.confidence, hard: f.hard },
        })),
      },
    ],
  };
}
