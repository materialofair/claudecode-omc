#!/usr/bin/env node
/**
 * OMC HUD - Standalone Statusline Script
 * Self-contained version for claudecode-omc (no upstream dist/hud dependency)
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function main() {
  const home = homedir();
  const configDir = process.env.CLAUDE_CONFIG_DIR || join(home, ".claude");

  const parts = [];

  // 1. Package version
  const version = getPackageVersion();
  if (version) parts.push(`omc v${version}`);

  // 2. Skills count
  const skillsDir = join(configDir, "skills");
  const skillCount = countDirs(skillsDir);
  if (skillCount > 0) parts.push(`${skillCount} skills`);

  // 3. Agents count
  const agentsDir = join(configDir, "agents");
  const agentCount = countFiles(agentsDir, ".md");
  if (agentCount > 0) parts.push(`${agentCount} agents`);

  // 4. Active OMC state
  const omcState = readOmcState();
  if (omcState) parts.push(omcState);

  // 5. Git branch
  const branch = getGitBranch();
  if (branch) parts.push(branch);

  console.log(parts.join(" | ") || "omc ready");
}

function getPackageVersion() {
  try {
    // Check global npm install
    const result = JSON.parse(readFileSync(
      new URL("claudecode-omc/package.json", import.meta.resolve("claudecode-omc")),
      "utf8"
    ));
    return result.version;
  } catch {
    // Fallback: check common locations
    const candidates = [
      join(homedir(), ".omc-manage", "package-version"),
    ];
    for (const p of candidates) {
      try {
        return readFileSync(p, "utf8").trim();
      } catch { /* continue */ }
    }
    return null;
  }
}

function countDirs(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isDirectory()).length;
  } catch { return 0; }
}

function countFiles(dir, ext) {
  try {
    return readdirSync(dir)
      .filter(f => f.endsWith(ext)).length;
  } catch { return 0; }
}

function readOmcState() {
  const stateFile = join(process.cwd(), ".omc", "state", "active-mode.json");
  try {
    const state = JSON.parse(readFileSync(stateFile, "utf8"));
    if (state.mode) return state.mode;
  } catch { /* no active mode */ }
  return null;
}

function getGitBranch() {
  const headFile = join(process.cwd(), ".git", "HEAD");
  try {
    const head = readFileSync(headFile, "utf8").trim();
    if (head.startsWith("ref: refs/heads/")) {
      return head.slice("ref: refs/heads/".length);
    }
    return head.slice(0, 7); // detached HEAD
  } catch { return null; }
}

main();
