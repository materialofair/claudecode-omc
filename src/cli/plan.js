/* eslint-disable no-console */
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { getProjectRoot, getSourceArtifactDir, getSourceMetadataDir } = require('../config/paths');
const { buildSourceCatalog, buildInstallPlan, deriveSourceActivation } = require('../catalog/source-catalog');
const { updateSource, readConfig } = require('../config/sources');

function findUnsyncedArtifactTypes(sourceName, artifactTypes, root) {
  return (artifactTypes || []).filter((artifactType) => {
    const dir = getSourceArtifactDir(sourceName, artifactType, root);
    if (!fs.existsSync(dir)) return true;
    if (!fs.statSync(dir).isDirectory()) return false;
    return fs.readdirSync(dir).length === 0;
  });
}

async function readSelectionFile(selectionFile) {
  const raw = await fsp.readFile(selectionFile, 'utf8');
  const data = JSON.parse(raw);
  return data && typeof data === 'object' ? data : {};
}

function extractAllowlistFromSelection(planResult, selectionData = {}) {
  const allowlist = {};
  const selectedArtifacts = planResult.actions.filter(action => action.type === 'install-artifact');
  const warnings = [];

  for (const action of selectedArtifacts) {
    const requested = selectionData[action.artifactType];
    if (!requested) continue;

    const requestedNames = [...new Set(Array.isArray(requested) ? requested : [])];
    if (requestedNames.length === 0) continue;

    // Only validate against itemNames when the catalog actually expanded them.
    // Manifest-driven surfaces (e.g. plugin.json) carry only counts, so trust
    // the user's selection and let setup's filterItemsByAllowlist enforce
    // membership against the real on-disk artifact list.
    if (Array.isArray(action.itemNames) && action.itemNames.length > 0) {
      const allowedNames = new Set(action.itemNames);
      const unknown = requestedNames.filter(name => !allowedNames.has(name));
      if (unknown.length > 0) {
        throw new Error(`Unknown ${action.artifactType} selections: ${unknown.join(', ')}`);
      }
    } else {
      warnings.push(`${action.artifactType}: ${requestedNames.length} selections accepted without catalog validation (manifest-driven surface).`);
    }

    allowlist[action.artifactType] = requestedNames.sort();
  }

  for (const warning of warnings) {
    console.warn(`  warn: ${warning}`);
  }

  return Object.keys(allowlist).length > 0 ? allowlist : undefined;
}

async function writePlanAudit(sourceName, root, planResult, activation) {
  const metadataDir = getSourceMetadataDir(sourceName, root);
  await fsp.mkdir(metadataDir, { recursive: true });
  const audit = {
    appliedAt: new Date().toISOString(),
    plan: {
      sourceName: planResult.sourceName,
      kind: planResult.kind,
      profile: planResult.profile,
      installMode: planResult.installMode,
      actions: planResult.actions,
      warnings: planResult.warnings,
    },
    activation,
  };
  await fsp.writeFile(path.join(metadataDir, 'last-plan-apply.json'), JSON.stringify(audit, null, 2) + '\n', 'utf8');
}

async function plan(args, flags = {}) {
  const cmd = args[0] || 'install';

  switch (cmd) {
    case 'install': {
      const sourceName = args[1];
      if (!sourceName) {
        throw new Error('Usage: omc-manage plan install <source> [--profile claude-runtime] [--json]');
      }

      const profile = flags.profile || 'claude-runtime';
      const catalog = await buildSourceCatalog(sourceName, getProjectRoot());
      const planResult = buildInstallPlan(catalog, profile);

      if (flags.json) {
        console.log(JSON.stringify(planResult, null, 2));
        return;
      }

      console.log(`Install Plan: ${sourceName}`);
      console.log('='.repeat(40));
      console.log(`kind: ${planResult.kind}`);
      console.log(`installMode: ${planResult.installMode}`);
      console.log(`profile: ${planResult.profile}`);
      console.log('');

      console.log('Actions:');
      for (const action of planResult.actions) {
        if (action.type === 'install-artifact') {
          console.log(`  install ${action.artifactType} via ${action.adapter} (${action.count} items)`);
          if (action.itemNames && action.itemNames.length > 0) {
            console.log(`    curatable: ${action.itemNames.length} names available`);
          }
        } else {
          console.log(`  retain ${action.surface} as reference via ${action.adapter || 'n/a'} (${action.count} items)`);
        }
      }

      console.log('');
      console.log(`Selected surfaces: ${planResult.selectedSurfaces.length}`);
      console.log(`Skipped surfaces: ${planResult.skippedSurfaces.length}`);

      if (planResult.warnings.length > 0) {
        console.log('');
        console.log('Warnings:');
        for (const warning of planResult.warnings) {
          console.log(`  - ${warning}`);
        }
      }
      return;
    }

    case 'apply': {
      const sourceName = args[1];
      if (!sourceName) {
        throw new Error('Usage: omc-manage plan apply <source> [--profile claude-runtime] [--dry-run] [--json]');
      }

      const root = getProjectRoot();
      const profile = flags.profile || 'claude-runtime';
      const catalog = await buildSourceCatalog(sourceName, root);
      const planResult = buildInstallPlan(catalog, profile);
      const selectionData = flags.selectionFile ? await readSelectionFile(flags.selectionFile) : {};
      const allowlist = extractAllowlistFromSelection(planResult, selectionData);
      const currentSource = readConfig().sources[sourceName] || {};
      const activation = {
        ...deriveSourceActivation(planResult, currentSource),
        allowlist,
      };

      if (flags.json) {
        console.log(JSON.stringify({ plan: planResult, activation }, null, 2));
        return;
      }

      console.log(`Apply Plan: ${sourceName}`);
      console.log('='.repeat(40));
      console.log(`kind: ${planResult.kind}`);
      console.log(`current installMode: ${planResult.installMode}`);
      console.log(`target profile: ${planResult.profile}`);
      console.log(`next installMode: ${activation.installMode}`);
      console.log(`next role: ${activation.role || 'installable'}`);
      console.log(`next artifacts: ${activation.artifacts.join(', ') || '(none)'}`);
      if (activation.allowlist) {
        console.log(`next allowlist: ${Object.entries(activation.allowlist).map(([type, names]) => `${type}(${names.length})`).join(', ')}`);
      }

      // Warn when activation includes artifact types whose source dir is
      // missing or empty — typically because the surface was discovered via a
      // manifest (plugin.json/agent.yaml) but never pulled by `source sync`.
      // setup will silently no-op those types; surface that here so the user
      // can re-sync or narrow the artifacts list.
      if (activation.installMode === 'auto' && activation.artifacts.length > 0) {
        const unsynced = findUnsyncedArtifactTypes(sourceName, activation.artifacts, root);
        if (unsynced.length > 0) {
          console.warn('');
          console.warn(`  warn: ${unsynced.length} artifact type(s) declared but not synced: ${unsynced.join(', ')}`);
          console.warn(`  warn: run "omc-manage source sync ${sourceName}" or remove them from --artifacts`);
        }
      }

      if (flags.dryRun) {
        console.log('');
        console.log('[dry-run] No source config updated.');
        return;
      }

      const updatedSource = await updateSource(sourceName, (current) => ({
        ...current,
        installMode: activation.installMode,
        role: activation.role || undefined,
        artifacts: activation.artifacts,
        allowlist: activation.allowlist,
        appliedProfile: activation.appliedProfile,
        appliedAt: new Date().toISOString(),
      }));

      await writePlanAudit(sourceName, root, planResult, {
        installMode: updatedSource.installMode,
        role: updatedSource.role || null,
        artifacts: updatedSource.artifacts,
        allowlist: updatedSource.allowlist,
        appliedProfile: updatedSource.appliedProfile || profile,
      });

      console.log('');
      console.log('Applied to source config.');
      console.log(`  installMode: ${updatedSource.installMode}`);
      console.log(`  role: ${updatedSource.role || 'installable'}`);
      console.log(`  artifacts: ${(updatedSource.artifacts || []).join(', ')}`);
      if (updatedSource.allowlist) {
        console.log(`  allowlist: ${Object.entries(updatedSource.allowlist).map(([type, names]) => `${type}(${names.length})`).join(', ')}`);
      }
      console.log(`  audit: ${path.join(getSourceMetadataDir(sourceName, root), 'last-plan-apply.json')}`);
      return;
    }

    default:
      throw new Error(`Unknown subcommand: ${cmd}. Use: install or apply`);
  }
}

module.exports = { plan };
