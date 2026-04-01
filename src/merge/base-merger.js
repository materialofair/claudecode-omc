/* eslint-disable no-console */

/**
 * Base Merger Module
 *
 * Shared conflict detection and resolution logic for all artifact types.
 */

/**
 * Calculate Jaccard similarity between two descriptions
 */
function calculateDescriptionSimilarity(desc1, desc2) {
  if (!desc1 || !desc2) return 0;

  const words1 = new Set(desc1.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const words2 = new Set(desc2.toLowerCase().split(/\s+/).filter(w => w.length > 2));

  if (words1.size === 0 || words2.size === 0) return 0;

  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

/**
 * Compare semantic versions
 */
function compareVersions(v1, v2) {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  for (let i = 0; i < 3; i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;

    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }

  return 0;
}

/**
 * Detect conflicts between multiple artifact sources
 */
function detectConflicts(sourcesArray) {
  const byName = new Map();
  const allItems = [];
  const conflicts = [];

  for (const source of sourcesArray) {
    // Support both `items` (new API) and `skills` (backward-compatible alias)
    const entries = source.items || source.skills || [];
    for (const item of entries) {
      const enriched = { ...item, sourceName: source.name };
      allItems.push(enriched);

      if (!byName.has(item.name)) {
        byName.set(item.name, []);
      }
      byName.get(item.name).push(enriched);
    }
  }

  // Exact name conflicts
  for (const [name, versions] of byName.entries()) {
    if (versions.length > 1) {
      conflicts.push({ type: 'exact_name', name, versions });
    }
  }

  // Description similarity conflicts (optional, skip if no descriptions)
  for (let i = 0; i < allItems.length; i++) {
    for (let j = i + 1; j < allItems.length; j++) {
      const a = allItems[i];
      const b = allItems[j];
      if (a.name === b.name) continue;

      const desc1 = a.metadata?.description || '';
      const desc2 = b.metadata?.description || '';
      if (!desc1 || !desc2) continue;

      const similarity = calculateDescriptionSimilarity(desc1, desc2);
      if (similarity > 0.8) {
        conflicts.push({
          type: 'similar_description',
          name: `${a.name} vs ${b.name}`,
          versions: [a, b],
          similarity,
        });
      }
    }
  }

  return conflicts;
}

/**
 * Resolve conflicts using 4-tier strategy:
 * 1. User config preferences
 * 2. SemVer (highest version wins)
 * 3. Local priority (local > upstream)
 * 4. Namespace (keep both with prefixes)
 */
function resolveConflicts(conflicts, config = {}) {
  const resolutions = [];

  for (const conflict of conflicts) {
    const { name, versions, type, similarity } = conflict;

    if (type === 'similar_description') {
      resolutions.push({
        name, type: 'similar_description', resolution: 'warning',
        similarity, versions,
        message: `Similar functionality detected (${(similarity * 100).toFixed(1)}% match)`,
      });
      continue;
    }

    // Tier 1: User config preference
    if (config.preferences && config.preferences[name]) {
      const preferredSource = config.preferences[name];
      const preferred = versions.find(v => v.sourceName === preferredSource);
      if (preferred) {
        resolutions.push({
          name, type: 'exact_name', resolution: 'user-preference',
          winner: preferred, rejected: versions.filter(v => v !== preferred),
        });
        continue;
      }
    }

    // Tier 2: SemVer comparison
    const withVersions = versions.filter(v => v.metadata?.version);
    if (withVersions.length === versions.length && versions.length > 1) {
      const sorted = [...versions].sort((a, b) =>
        compareVersions(b.metadata.version, a.metadata.version)
      );
      if (compareVersions(sorted[0].metadata.version, sorted[1].metadata.version) > 0) {
        resolutions.push({
          name, type: 'exact_name', resolution: 'semver',
          winner: sorted[0], rejected: sorted.slice(1),
        });
        continue;
      }
    }

    // Tier 3: Local priority
    const localVersion = versions.find(v => v.sourceName === 'local');
    if (localVersion) {
      resolutions.push({
        name, type: 'exact_name', resolution: 'local-priority',
        winner: localVersion, rejected: versions.filter(v => v !== localVersion),
      });
      continue;
    }

    // Tier 3b: Priority by source order (lower priority number wins)
    // Just pick the first version (sources are ordered by priority)
    resolutions.push({
      name, type: 'exact_name', resolution: 'source-priority',
      winner: versions[0], rejected: versions.slice(1),
    });
  }

  return resolutions;
}

/**
 * Apply resolutions and create merged item list
 */
function applyResolutions(sourcesArray, resolutions) {
  const merged = new Map();
  const conflictNames = new Set();

  for (const resolution of resolutions) {
    if (resolution.type === 'exact_name') {
      conflictNames.add(resolution.name);
    }
  }

  for (const source of sourcesArray) {
    // Support both `items` (new API) and `skills` (backward-compatible alias)
    const entries = source.items || source.skills || [];
    for (const item of entries) {
      if (!conflictNames.has(item.name)) {
        merged.set(item.name, { ...item, sourceName: source.name });
      }
    }
  }

  for (const resolution of resolutions) {
    if (resolution.type === 'similar_description') continue;
    if (resolution.resolution === 'namespace') {
      for (const ns of resolution.namespaced) {
        merged.set(ns.namespacedName, ns);
      }
    } else if (resolution.winner) {
      merged.set(resolution.name, resolution.winner);
    }
  }

  return Array.from(merged.values());
}

/**
 * Generate merge report
 */
function generateReport(artifactType, conflicts, resolutions) {
  const report = {
    timestamp: new Date().toISOString(),
    artifactType,
    summary: {
      total_conflicts: conflicts.length,
      exact_name_conflicts: conflicts.filter(c => c.type === 'exact_name').length,
      similar_description_warnings: conflicts.filter(c => c.type === 'similar_description').length,
      resolutions: {},
    },
    conflicts: [],
  };

  for (const resolution of resolutions) {
    report.summary.resolutions[resolution.resolution] =
      (report.summary.resolutions[resolution.resolution] || 0) + 1;

    const conflictData = {
      name: resolution.name,
      type: resolution.type,
      resolution: resolution.resolution,
    };

    if (resolution.similarity !== undefined) {
      conflictData.similarity = resolution.similarity;
      conflictData.message = resolution.message;
    }
    if (resolution.winner) {
      conflictData.winner = { source: resolution.winner.sourceName };
    }
    if (resolution.rejected) {
      conflictData.rejected = resolution.rejected.map(r => ({ source: r.sourceName }));
    }

    report.conflicts.push(conflictData);
  }

  return report;
}

module.exports = {
  calculateDescriptionSimilarity,
  compareVersions,
  detectConflicts,
  resolveConflicts,
  applyResolutions,
  generateReport,
};
