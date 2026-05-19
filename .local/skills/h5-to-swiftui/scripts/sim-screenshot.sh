#!/usr/bin/env bash
# sim-screenshot.sh — Stage 5: iOS Simulator render + capture for SwiftUI snapshot host
#
# Usage:
#   sim-screenshot.sh --probe
#       Print capability JSON to stdout and exit 0.
#       { "schema":"h5-to-swiftui/simprobe@1", "xcode":bool, "simctl":bool,
#         "xcodebuild":bool, "available_runtimes":[...],
#         "stage5_ready":bool, "ok":bool }
#       stage5_ready is true ONLY iff every required tool is present AND at
#       least one simulator runtime is available — tools-present alone is
#       misleading (you cannot capture without a runtime). ok mirrors
#       stage5_ready. The probe itself always exits 0 (diagnostic only).
#
#   sim-screenshot.sh --project <path> --scheme <scheme> --device "iPhone 15 Pro"
#                     --component <Name> --out <output.png>
#       Build the snapshot host project, boot the simulator, capture the
#       per-component snapshot and write it to <output.png>.
#       Exit 0 on success.
#
#   sim-screenshot.sh --help
#       Print this usage and exit 0.
#
# Capability gate (no-fake spine):
#   If xcrun simctl or xcodebuild is unavailable, the build fails, OR the
#   --project path does not exist (cannot yield a build artifact), writes
#   blocked.json next to --out and exits 3.
#   Build failure NEVER produces a PNG. No fake convergence. Only pure usage
#   errors (missing required flags) exit 1.
#
# Simulator selection:
#   The first available runtime for the requested device model is used.
#   "Available" means listed by xcrun simctl list devices --json. If multiple
#   runtimes match, the highest-version one is selected (sort -r on the
#   runtime identifier, which is lexicographically ordered by version).
#   The selected runtime and device UDID are recorded in the blocked.json on
#   failure and in a companion .meta.json on success.
#
# Dependencies:
#   xcrun (Xcode command-line tools), simctl, xcodebuild
#   All are checked at runtime; missing tools => blocked.json + exit 3.
#
# Exit codes:
#   0  -- success (PNG written) OR probe completed OR --help
#   1  -- pure usage error (missing required flags)
#   3  -- capability gate: no-xcode | build-failed | no-runtime |
#         project-missing | capture-failed  (blocked.json written)
#
# POSIX bash; set -euo pipefail.

set -euo pipefail

# ── Constants ─────────────────────────────────────────────────────────────────

SCHEMA_BLOCKED="h5-to-swiftui/blocked@1"
SCHEMA_PROBE="h5-to-swiftui/simprobe@1"
STAGE="5"

# ── Helpers ───────────────────────────────────────────────────────────────────

die() {
  echo "Error: $*" >&2
  exit 1
}

# Write blocked.json next to --out path.
#   $1 out_path  $2 component  $3 reason
#   $4.. optional extra fields, each as a literal "key=value" token; every
#        extra is emitted as its own JSON string line (valid + consistent
#        with the probe/meta artifacts — no same-line concatenation).
write_blocked() {
  local out_path="$1"
  local component="$2"
  local reason="$3"
  shift 3

  local blocked_path
  blocked_path="$(dirname "$out_path")/blocked.json"

  # Base fields, one key per line.
  {
    printf '{\n'
    printf '  "schema": "%s",\n' "$SCHEMA_BLOCKED"
    printf '  "stage": "%s",\n' "$STAGE"
    printf '  "component": "%s",\n' "$component"
    # reason is last UNLESS extras follow; emit comma conditionally.
    if [ "$#" -gt 0 ]; then
      printf '  "reason": "%s",\n' "$reason"
      local n=$#
      local idx=0
      local pair key val
      for pair in "$@"; do
        idx=$((idx + 1))
        key="${pair%%=*}"
        val="${pair#*=}"
        if [ "$idx" -lt "$n" ]; then
          printf '  "%s": "%s",\n' "$key" "$val"
        else
          printf '  "%s": "%s"\n' "$key" "$val"
        fi
      done
    else
      printf '  "reason": "%s"\n' "$reason"
    fi
    printf '}\n'
  } > "$blocked_path"

  echo "Wrote: $blocked_path" >&2
}

# Check whether a command exists on PATH
have_cmd() {
  command -v "$1" > /dev/null 2>&1
}

# ── Probe mode ────────────────────────────────────────────────────────────────

do_probe() {
  local has_xcode=false
  local has_simctl=false
  local has_xcodebuild=false
  local runtimes_json='[]'

  if have_cmd xcrun; then
    has_xcode=true

    # simctl
    if xcrun simctl help > /dev/null 2>&1; then
      has_simctl=true

      # Collect available runtimes (name field where isAvailable=true).
      # Use awk for POSIX portability; store the program in a variable to
      # avoid single-quote nesting issues.
      local raw
      raw="$(xcrun simctl list runtimes --json 2>/dev/null || printf '{}')"

      # awk program: emit JSON array of runtime name strings
      local awk_prog
      awk_prog='BEGIN { is_avail=0; name=""; first=1; printf "[" }
/"isAvailable"[[:space:]]*:[[:space:]]*true/ { is_avail=1 }
/"name"[[:space:]]*:/ {
  n=split($0,a,"\""); for(i=1;i<=n;i++) { if(a[i]=="name") { name=a[i+2]; break } }
}
/^[[:space:]]*\}/ {
  if (is_avail && name != "") {
    if (!first) printf ","
    printf "\"%s\"", name
    first=0
  }
  is_avail=0; name=""
}
END { printf "]\n" }'

      runtimes_json="$(printf '%s' "$raw" | awk "$awk_prog" 2>/dev/null || printf '[]')"
    fi

    # xcodebuild
    if xcrun xcodebuild -version > /dev/null 2>&1; then
      has_xcodebuild=true
    fi
  fi

  # Tools present?
  local tools_present=true
  if [ "$has_xcode" = "false" ] || [ "$has_simctl" = "false" ] || [ "$has_xcodebuild" = "false" ]; then
    tools_present=false
  fi

  # At least one runtime available? (runtimes_json is "[]" when none)
  local has_runtime=false
  if [ "$runtimes_json" != "[]" ] && [ -n "$runtimes_json" ]; then
    has_runtime=true
  fi

  # stage5_ready: tools AND >=1 runtime. Tools-present alone is misleading —
  # a capture cannot happen without a runtime, so ok must reflect that.
  local stage5_ready=false
  if [ "$tools_present" = "true" ] && [ "$has_runtime" = "true" ]; then
    stage5_ready=true
  fi

  printf '{\n  "schema": "%s",\n  "xcode": %s,\n  "simctl": %s,\n  "xcodebuild": %s,\n  "available_runtimes": %s,\n  "stage5_ready": %s,\n  "ok": %s\n}\n' \
    "$SCHEMA_PROBE" \
    "$has_xcode" \
    "$has_simctl" \
    "$has_xcodebuild" \
    "$runtimes_json" \
    "$stage5_ready" \
    "$stage5_ready"

  exit 0
}

# ── Capability check (for non-probe modes) ────────────────────────────────────

# Returns 0 if all required tools are present, sets BLOCK_REASON on failure.
BLOCK_REASON=""
check_capabilities() {
  if ! have_cmd xcrun; then
    BLOCK_REASON="no-xcode"
    return 1
  fi
  if ! xcrun simctl help > /dev/null 2>&1; then
    BLOCK_REASON="no-xcode"
    return 1
  fi
  if ! xcrun xcodebuild -version > /dev/null 2>&1; then
    BLOCK_REASON="no-xcode"
    return 1
  fi
  return 0
}

# ── Runtime + device selection ────────────────────────────────────────────────

# Finds the best available simulator for the requested device model.
# Outputs: <runtime_identifier>|<udid>  (single line, highest version first)
# Returns 1 (empty output) if no matching device/runtime is found.
find_simulator() {
  local device_model="$1"  # e.g. "iPhone 15 Pro"

  # List all available devices as JSON
  local raw
  raw="$(xcrun simctl list devices --json 2>/dev/null || printf '{}')"

  # awk program stored in variable to avoid single-quote quoting issues.
  # Walk the JSON; track current runtime key; for each device entry matching
  # device_model with isAvailable=true, emit "runtime|udid".
  local awk_prog
  awk_prog='BEGIN { cur_rt=""; cur_name=""; cur_udid=""; cur_avail=0 }
/^[[:space:]]*"com\.apple\.CoreSimulator\.SimRuntime\./ {
  n=split($0,a,"\""); for(i=1;i<=n;i++) {
    if(a[i] ~ /^com\.apple\.CoreSimulator\.SimRuntime\./) { cur_rt=a[i]; break }
  }
  cur_name=""; cur_udid=""; cur_avail=0
}
/"name"[[:space:]]*:/ {
  n=split($0,a,"\""); for(i=1;i<=n;i++) { if(a[i]=="name") { cur_name=a[i+2]; break } }
}
/"udid"[[:space:]]*:/ {
  n=split($0,a,"\""); for(i=1;i<=n;i++) { if(a[i]=="udid") { cur_udid=a[i+2]; break } }
}
/"isAvailable"[[:space:]]*:[[:space:]]*true/ { cur_avail=1 }
/^[[:space:]]*\}/ {
  if (cur_avail && cur_name==model && cur_udid!="") {
    print cur_rt "|" cur_udid
  }
  cur_avail=0; cur_name=""; cur_udid=""
}'

  printf '%s' "$raw" | awk -v model="$device_model" "$awk_prog" | sort -r | head -1
}

# ── Build snapshot host ───────────────────────────────────────────────────────

build_snapshot_host() {
  local project_path="$1"
  local scheme="$2"
  local sdk="$3"          # e.g. "iphonesimulator"
  local destination="$4"  # xcodebuild -destination value
  local build_log="$5"

  xcrun xcodebuild \
    -project "$project_path" \
    -scheme "$scheme" \
    -sdk "$sdk" \
    -destination "$destination" \
    -configuration Debug \
    build \
    > "$build_log" 2>&1
}

# ── Main capture flow ─────────────────────────────────────────────────────────

do_capture() {
  local project_path="$1"
  local scheme="$2"
  local device_model="$3"
  local component="$4"
  local out_png="$5"

  local out_dir
  out_dir="$(dirname "$out_png")"
  mkdir -p "$out_dir"

  # 1. Capability gate
  if ! check_capabilities; then
    echo "Error: required toolchain unavailable: $BLOCK_REASON" >&2
    echo "Install Xcode and command-line tools, then re-run." >&2
    write_blocked "$out_png" "$component" "$BLOCK_REASON"
    exit 3
  fi

  # 2. Find simulator
  echo "Looking for simulator: $device_model" >&2
  local sim_info
  sim_info="$(find_simulator "$device_model" || true)"

  if [ -z "$sim_info" ]; then
    echo "Error: no available simulator found for device \"$device_model\"." >&2
    echo "Run: xcrun simctl list devices" >&2
    write_blocked "$out_png" "$component" "no-runtime" \
      "device=$device_model"
    exit 3
  fi

  local runtime_id udid
  runtime_id="${sim_info%%|*}"
  udid="${sim_info##*|}"

  echo "Selected runtime: $runtime_id" >&2
  echo "Selected UDID:    $udid" >&2

  # Extract human-readable runtime name from the identifier
  # e.g. com.apple.CoreSimulator.SimRuntime.iOS-17-5 -> iOS 17.5
  local runtime_name
  runtime_name="$(printf '%s' "$runtime_id" | sed -E 's/.*\.iOS-([0-9]+)-([0-9]+)$/iOS \1.\2/')"
  echo "Runtime name:     $runtime_name" >&2

  # 3. Build the snapshot host project
  echo "Building $scheme in $project_path ..." >&2
  local build_log
  build_log="$(mktemp /tmp/sim-screenshot-build.XXXXXX.log)"

  local sdk="iphonesimulator"
  local destination="platform=iOS Simulator,id=$udid"

  if ! build_snapshot_host "$project_path" "$scheme" "$sdk" "$destination" "$build_log"; then
    echo "Error: xcodebuild failed. Build log: $build_log" >&2
    echo "--- Last 20 lines of build log ---" >&2
    tail -20 "$build_log" >&2
    echo "----------------------------------" >&2
    write_blocked "$out_png" "$component" "build-failed" \
      "build_log=$build_log" "runtime=$runtime_name" "udid=$udid"
    # NEVER produce a png on build failure
    exit 3
  fi

  echo "Build succeeded." >&2
  rm -f "$build_log"

  # 4. Boot simulator (idempotent -- already booted is fine)
  echo "Booting simulator $udid ..." >&2

  # Check current sim state using awk (stored in variable to avoid quoting issues)
  local awk_state
  awk_state='BEGIN { found=0 }
/"udid"/ { if ($0 ~ udid) found=1 }
/"state"/ {
  if (found) {
    n=split($0,a,"\""); for(i=1;i<=n;i++) { if(a[i]=="state") { print a[i+2]; found=0; break } }
  }
}'
  local boot_status
  boot_status="$(xcrun simctl list devices --json 2>/dev/null | \
    awk -v udid="$udid" "$awk_state" | head -1 || true)"

  if [ "$boot_status" != "Booted" ]; then
    xcrun simctl boot "$udid" 2>&1 | sed 's/^/  [simctl boot] /' >&2 || true
    # Wait for boot completion (bootstatus blocks until the sim is ready)
    xcrun simctl bootstatus "$udid" -b >&2 || true
  else
    echo "Simulator already booted." >&2
  fi

  # 5. Launch the app / snapshot host
  # The snapshot host is expected to write a PNG when launched with the
  # component name as a launch argument.  We launch it, wait for render,
  # then capture with simctl io screenshot.
  local bundle_id="$scheme"

  echo "Launching snapshot host for component: $component ..." >&2
  if ! xcrun simctl launch "$udid" "$bundle_id" \
      --component "$component" \
      2>&1 | sed 's/^/  [simctl launch] /' >&2; then
    echo "Error: simctl launch failed for bundle $bundle_id on $udid." >&2
    write_blocked "$out_png" "$component" "build-failed" \
      "detail=simctl launch failed" "bundle_id=$bundle_id" "runtime=$runtime_name" "udid=$udid"
    exit 3
  fi

  # Give the app time to render the snapshot
  sleep 2

  # 6. Capture screenshot via simctl io
  echo "Capturing screenshot from simulator ..." >&2
  if ! xcrun simctl io "$udid" screenshot "$out_png" 2>&1 | sed 's/^/  [simctl io] /' >&2; then
    echo "Error: simctl io screenshot failed." >&2
    write_blocked "$out_png" "$component" "build-failed" \
      "detail=simctl io screenshot failed" "runtime=$runtime_name" "udid=$udid"
    exit 3
  fi

  if [ ! -f "$out_png" ]; then
    echo "Error: screenshot not found at $out_png after capture." >&2
    write_blocked "$out_png" "$component" "build-failed" \
      "detail=output PNG not produced" "runtime=$runtime_name" "udid=$udid"
    exit 3
  fi

  # 7. Write companion .meta.json
  local meta_path="${out_png%.png}.meta.json"
  local ts
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf '{\n  "schema": "h5-to-swiftui/simsnapshot@1",\n  "component": "%s",\n  "device": "%s",\n  "runtime": "%s",\n  "udid": "%s",\n  "png": "%s",\n  "captured_at": "%s"\n}\n' \
    "$component" "$device_model" "$runtime_name" "$udid" "$out_png" "$ts" > "$meta_path"

  echo "Screenshot: $out_png" >&2
  echo "Meta:       $meta_path" >&2
  echo "Capture complete." >&2
  exit 0
}

# ── CLI dispatch ──────────────────────────────────────────────────────────────

if [ $# -eq 0 ]; then
  echo "Error: no arguments given. Run with --help for usage." >&2
  exit 1
fi

# Handle --help first (before set -e touches anything)
for arg in "$@"; do
  if [ "$arg" = "--help" ] || [ "$arg" = "-h" ]; then
    printf '%s\n' \
      "sim-screenshot.sh -- Stage 5: iOS Simulator render + capture" \
      "" \
      "Usage:" \
      "  sim-screenshot.sh --probe" \
      "      Print capability JSON to stdout and exit 0. The JSON includes" \
      "      stage5_ready (true iff tools present AND >=1 runtime); ok mirrors" \
      "      stage5_ready — tools-present alone is NOT enough to capture." \
      "" \
      "  sim-screenshot.sh --project <path> --scheme <scheme> \\" \
      "                    --device \"iPhone 15 Pro\" \\" \
      "                    --component <Name> --out <output.png>" \
      "      Build the snapshot host, boot the simulator, capture the per-component" \
      "      snapshot, and write it to <output.png>. Exit 0 on success." \
      "" \
      "  sim-screenshot.sh --help" \
      "      Print this usage and exit 0." \
      "" \
      "Arguments (capture mode):" \
      "  --project <path>      Path to the .xcodeproj snapshot host project (required)" \
      "  --scheme <scheme>     Xcode scheme to build; also used as the app bundle ID (required)" \
      "  --device <name>       Device model, e.g. \"iPhone 15 Pro\" (required)" \
      "  --component <Name>    SwiftUI component name to snapshot (required)" \
      "  --out <path>          Output PNG path (required)" \
      "" \
      "Capability gate (no-fake spine):" \
      "  If xcrun simctl/xcodebuild is unavailable, the build fails, OR the" \
      "  --project path does not exist (cannot yield a build artifact), this" \
      "  writes blocked.json next to --out and exits 3. Build failure NEVER" \
      "  produces a PNG. Only pure usage errors (missing required flags) exit 1." \
      "" \
      "Simulator selection:" \
      "  The highest-version available runtime matching the requested device model" \
      "  is selected via xcrun simctl list devices --json. The selection is" \
      "  recorded in the .meta.json companion file written on success." \
      "" \
      "Exit codes:" \
      "  0  Success (PNG written) or probe completed" \
      "  1  Pure usage error (missing required flags)" \
      "  3  Capability gate: no-xcode | build-failed | no-runtime |" \
      "     project-missing | capture-failed (blocked.json written)" \
      "" \
      "Examples:" \
      "  sim-screenshot.sh --probe" \
      "  sim-screenshot.sh --project SnapshotHost.xcodeproj \\" \
      "      --scheme com.example.SnapshotHost \\" \
      "      --device \"iPhone 15 Pro\" \\" \
      "      --component ProductCard \\" \
      "      --out artifacts/ProductCard.png"
    exit 0
  fi
done

# Handle --probe
for arg in "$@"; do
  if [ "$arg" = "--probe" ]; then
    do_probe
    # do_probe calls exit 0 internally
  fi
done

# Parse capture-mode arguments
PROJECT_PATH=""
SCHEME=""
DEVICE_MODEL=""
COMPONENT=""
OUT_PNG=""

while [ $# -gt 0 ]; do
  case "$1" in
    --project)
      [ $# -ge 2 ] || die "--project requires an argument."
      PROJECT_PATH="$2"; shift 2 ;;
    --scheme)
      [ $# -ge 2 ] || die "--scheme requires an argument."
      SCHEME="$2"; shift 2 ;;
    --device)
      [ $# -ge 2 ] || die "--device requires an argument."
      DEVICE_MODEL="$2"; shift 2 ;;
    --component)
      [ $# -ge 2 ] || die "--component requires an argument."
      COMPONENT="$2"; shift 2 ;;
    --out)
      [ $# -ge 2 ] || die "--out requires an argument."
      OUT_PNG="$2"; shift 2 ;;
    --sim-runtime|--browser|--model-id)
      # Accepted but unused in capture mode (informational flags for callers)
      shift 2 ;;
    *)
      die "Unknown argument: $1. Run with --help for usage." ;;
  esac
done

# Validate required capture-mode args
MISSING_ARGS=""
[ -z "$PROJECT_PATH" ] && MISSING_ARGS="$MISSING_ARGS --project"
[ -z "$SCHEME" ]        && MISSING_ARGS="$MISSING_ARGS --scheme"
[ -z "$DEVICE_MODEL" ]  && MISSING_ARGS="$MISSING_ARGS --device"
[ -z "$COMPONENT" ]     && MISSING_ARGS="$MISSING_ARGS --component"
[ -z "$OUT_PNG" ]       && MISSING_ARGS="$MISSING_ARGS --out"

if [ -n "$MISSING_ARGS" ]; then
  echo "Error: missing required arguments:$MISSING_ARGS" >&2
  echo "Run with --help for usage." >&2
  exit 1
fi

# A --project that does not exist is a capture-mode path that cannot yield a
# build artifact. It MUST go through the no-fake guarantee: write_blocked
# (stage 5, reason project-missing) and exit 3 — never a bare exit 1, which
# would bypass the no-fake-success spine. (Pure usage errors above still exit 1.)
if [ ! -e "$PROJECT_PATH" ]; then
  echo "Error: --project not found: $PROJECT_PATH" >&2
  echo "Cannot produce a build artifact — blocking (no fake success)." >&2
  mkdir -p "$(dirname "$OUT_PNG")"
  write_blocked "$OUT_PNG" "$COMPONENT" "project-missing" \
    "detail=--project path does not exist" "project=$PROJECT_PATH"
  exit 3
fi

do_capture "$PROJECT_PATH" "$SCHEME" "$DEVICE_MODEL" "$COMPONENT" "$OUT_PNG"
