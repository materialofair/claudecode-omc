/* eslint-disable no-console */
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { getProjectRoot, getSourceArtifactDir } = require('../config/paths');
const { readConfig } = require('../config/sources');
const { loadClaudeMd } = require('../merge/claude-md-merger');

function sanitizeSlug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'untitled';
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function getGuidelineSources(root, requestedSources = []) {
  const config = readConfig();
  const requested = new Set(requestedSources);

  return Object.entries(config.sources)
    .sort(([, a], [, b]) => a.priority - b.priority)
    .filter(([name, source]) => {
      if (source.role === 'reference') return false;
      if (requested.size > 0 && !requested.has(name)) return false;
      const artifacts = source.artifacts || [];
      return artifacts.includes('guidelines') || artifacts.includes('claude-md');
    })
    .map(([name, source]) => {
      const dir = getSourceArtifactDir(name, 'guidelines', root);
      return { name, source, dir };
    })
    .filter(({ dir }) => fs.existsSync(dir))
    .map(({ name, source, dir }) => {
      const content = loadClaudeMd(dir);
      if (!content) return null;
      return {
        sourceName: name,
        priority: source.priority,
        role: source.role || null,
        dir,
        content,
      };
    })
    .filter(Boolean);
}

function extractDocumentTitle(content) {
  const firstHeader = content.match(/^#\s+(.+)$/m);
  return firstHeader ? firstHeader[1].trim() : 'Guidelines';
}

function splitGuidelineSections(content, sourceName) {
  const normalized = content.replace(/\r\n/g, '\n').trim();
  const docTitle = extractDocumentTitle(normalized);
  const lines = normalized.split('\n');
  const sections = [];
  let current = null;
  let sectionIndex = 0;

  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      if (current && current.body.trim()) {
        sections.push(current);
      }
      sectionIndex += 1;
      current = {
        id: `${sourceName}:${sectionIndex}`,
        sourceName,
        title: line.replace(/^##\s+/, '').trim(),
        body: '',
      };
      continue;
    }

    if (!current) {
      current = {
        id: `${sourceName}:0`,
        sourceName,
        title: docTitle,
        body: '',
      };
    }

    current.body += (current.body ? '\n' : '') + line;
  }

  if (current && current.body.trim()) {
    sections.push(current);
  }

  return sections
    .map((section, index) => ({
      ...section,
      id: `${sourceName}:${index + 1}`,
      body: section.body.trim(),
      slug: sanitizeSlug(section.title),
    }))
    .filter(section => section.body.length > 0);
}

function buildOptimizerPrompt({ sources, sections, currentLocalGuidelines, outputPath }) {
  const sourceSummary = sources
    .map(source => `- ${source.sourceName} (priority ${source.priority}${source.role ? `, role ${source.role}` : ''})`)
    .join('\n');

  const sectionText = sections.map((section) => (
    `### ${section.id} — ${section.title}\n` +
    `Source: ${section.sourceName}\n\n` +
    `${section.body}\n`
  )).join('\n');

  const currentLocalText = currentLocalGuidelines
    ? currentLocalGuidelines.trim()
    : '_No current local guidelines file found._';

  return `# Guideline Optimizer Input

You are maintaining OMC's canonical runtime guidelines.

## Goal

Produce an improved \`CLAUDE.md\` section for OMC by semantically deduplicating,
merging, rewriting, and prioritizing the guideline material collected below.

## Constraints

- This is a maintainer workflow. The optimizer logic itself does not ship to end users.
- The runtime output must stay concise, high-signal, and suitable for always-on use.
- Prefer rewriting combined rules over stacking near-duplicates.
- Preserve behaviorally important constraints even if wording changes.
- Surface genuine conflicts explicitly instead of silently averaging them away.
- The final markdown should be written to \`${outputPath}\`.
- Output markdown body only. Do not include surrounding commentary.

## Source Summary

${sourceSummary}

## Current Local Guidelines

${currentLocalText}

## Extracted Source Sections

${sectionText}

## Required Output Shape

1. A canonical markdown document body suitable for \`${outputPath}\`
2. Short internal rationale notes for:
   - merged rules
   - dropped rules
   - unresolved conflicts

When two sections are semantically overlapping, prefer a single clearer rule.
When one section is a stronger, more specific operationalization of another,
keep the stronger wording and note the collapse in rationale.`;
}

async function ensureDir(dirPath) {
  await fsp.mkdir(dirPath, { recursive: true });
}

async function writeJson(filePath, value) {
  await ensureDir(path.dirname(filePath));
  await fsp.writeFile(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

async function writeText(filePath, value) {
  await ensureDir(path.dirname(filePath));
  await fsp.writeFile(filePath, value, 'utf8');
}

function buildNextSteps({ summary, latestDir }) {
  const lines = [
    '# Guideline Optimizer Next Steps',
    '',
    'This workflow is for Claude Code CLI or Codex operating inside the OMC repository.',
    '',
    '## Read First',
    '',
    `- ${path.join(latestDir, 'optimizer-input.md')}`,
    `- ${path.join(latestDir, 'sections.json')}`,
    `- ${path.join(latestDir, 'sources.json')}`,
    `- ${path.join(summary.root, '.maintainer', 'skills', 'guideline-optimizer', 'SKILL.md')}`,
    '',
    '## Edit Target',
    '',
    `- ${summary.outputPath}`,
    '',
    '## Required Verification',
    '',
    '```bash',
    'node bin/omc-manage.js setup --dry-run --type guidelines',
    'node bin/omc-manage.js artifact list --type guidelines',
    '```',
    '',
    '## Rules',
    '',
    '- Apply semantic merging, not text-level dedupe.',
    '- Keep maintainer reasoning out of the runtime guideline file.',
    '- Do not move maintainer-only workflow prompts into `.local/skills/`.',
    '',
    '## Structured Result Contract',
    '',
    'Create a JSON file with this shape, then apply it with the CLI:',
    '',
    '```json',
    '{',
    '  "version": 1,',
    '  "generatedBy": "claude-code | codex | other",',
    '  "summary": "short description of what changed",',
    '  "runtimeGuidelinesMarkdown": "# Coding Discipline\\n...",',
    '  "decisions": [',
    '    {',
    '      "action": "keep | merge | rewrite | drop",',
    '      "sourceSectionIds": ["local:2"],',
    '      "title": "Think Before Coding",',
    '      "rationale": "why this rule stayed or changed"',
    '    }',
    '  ],',
    '  "conflicts": [',
    '    {',
    '      "sourceSectionIds": ["a:2", "b:4"],',
    '      "resolution": "how the conflict was resolved"',
    '    }',
    '  ]',
    '}',
    '```',
    '',
    'Apply it with:',
    '',
    '```bash',
    'node bin/omc-manage.js guidelines apply --result-file /absolute/path/to/result.json',
    'node bin/omc-manage.js setup --dry-run --type guidelines',
    '```',
  ];

  return lines.join('\n') + '\n';
}

async function optimizeGuidelines(options = {}) {
  const root = getProjectRoot();
  const selectedSources = options.sources || [];
  const sources = getGuidelineSources(root, selectedSources);

  if (sources.length === 0) {
    throw new Error('No guideline sources found. Add a guidelines source or create .local/guidelines/CLAUDE.md.');
  }

  const sections = sources.flatMap(source => splitGuidelineSections(source.content, source.sourceName));
  const localGuidelinesPath = path.join(root, '.local', 'guidelines', 'CLAUDE.md');
  const currentLocalGuidelines = fs.existsSync(localGuidelinesPath)
    ? fs.readFileSync(localGuidelinesPath, 'utf8')
    : '';

  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const baseOutputDir = options.outputDir
    ? path.resolve(root, options.outputDir)
    : path.join(root, '.omc', 'guidelines');
  const latestDir = path.join(baseOutputDir, 'latest');
  const runDir = path.join(baseOutputDir, 'runs', runId);

  const summary = {
    runId,
    root,
    sourceCount: sources.length,
    sectionCount: sections.length,
    outputPath: localGuidelinesPath,
    currentLocalGuidelinesHash: sha256(currentLocalGuidelines || ''),
    latestDir,
    runDir,
    sources: sources.map(source => ({
      sourceName: source.sourceName,
      priority: source.priority,
      role: source.role,
      dir: source.dir,
      title: extractDocumentTitle(source.content),
      contentHash: sha256(source.content),
    })),
  };

  const prompt = buildOptimizerPrompt({
    sources: summary.sources,
    sections,
    currentLocalGuidelines,
    outputPath: localGuidelinesPath,
  });

  if (!options.dryRun) {
    await ensureDir(latestDir);
    await ensureDir(runDir);
    const nextSteps = buildNextSteps({ summary, latestDir });

    await writeJson(path.join(latestDir, 'summary.json'), summary);
    await writeJson(path.join(latestDir, 'sections.json'), sections);
    await writeJson(path.join(latestDir, 'sources.json'), summary.sources);
    await writeText(path.join(latestDir, 'optimizer-input.md'), prompt);
    await writeText(path.join(latestDir, 'current-local-guidelines.md'), currentLocalGuidelines || '');
    await writeText(path.join(latestDir, 'next-steps.md'), nextSteps);

    await writeJson(path.join(runDir, 'summary.json'), summary);
    await writeJson(path.join(runDir, 'sections.json'), sections);
    await writeJson(path.join(runDir, 'sources.json'), summary.sources);
    await writeText(path.join(runDir, 'optimizer-input.md'), prompt);
    await writeText(path.join(runDir, 'current-local-guidelines.md'), currentLocalGuidelines || '');
    await writeText(path.join(runDir, 'next-steps.md'), nextSteps);
  }

  return { summary, prompt };
}

module.exports = {
  optimizeGuidelines,
  getGuidelineSources,
  splitGuidelineSections,
  buildOptimizerPrompt,
  sha256,
};
