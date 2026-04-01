#!/usr/bin/env python3
"""
Session catchup helper for planning-with-files.

Checks if planning files were updated long ago while the working tree changed,
and prints a lightweight catchup reminder.
"""

from __future__ import annotations

import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path

PLANNING_FILES = ("task_plan.md", "findings.md", "progress.md")


def run(cmd: list[str], cwd: Path) -> str:
    try:
        out = subprocess.check_output(cmd, cwd=str(cwd), stderr=subprocess.STDOUT, text=True)
        return out.strip()
    except Exception:
        return ""


def newest_planning_mtime(root: Path) -> float:
    mtimes = []
    for name in PLANNING_FILES:
        p = root / name
        if p.exists():
            mtimes.append(p.stat().st_mtime)
    return max(mtimes) if mtimes else 0.0


def main() -> int:
    root = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path.cwd().resolve()
    if not (root / ".git").exists():
        return 0

    planning_mtime = newest_planning_mtime(root)
    if planning_mtime == 0:
        return 0

    diff_stat = run(["git", "diff", "--stat"], root)
    if not diff_stat:
        return 0

    now = datetime.now().timestamp()
    age_hours = (now - planning_mtime) / 3600
    if age_hours < 1:
        return 0

    print("[planning-with-files] Catchup reminder")
    print("Detected git changes after last planning file update.")
    print("Recommended next steps:")
    print("1. Read task_plan.md, findings.md, progress.md")
    print("2. Run: git diff --stat")
    print("3. Sync planning files with current code changes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

