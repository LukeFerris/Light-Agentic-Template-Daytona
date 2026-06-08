#!/usr/bin/env bash
# Pre-commit gate: ensures /check-patterns has been run before committing.
# The stamp file (.patterns-checked) persists across retries so that lint/test
# fixes don't force a redundant re-check.

set -euo pipefail

STAMP_FILE=".patterns-checked"

if [ -z "$(git diff --cached --name-only)" ]; then
  exit 0
fi

if [ -f "$STAMP_FILE" ]; then
  rm -f "$STAMP_FILE"
  exit 0
fi

cat <<'MSG'
╔══════════════════════════════════════════════════════════════════╗
║  PATTERN CHECK REQUIRED                                         ║
║                                                                  ║
║  Run /check-patterns to audit staged changes for:               ║
║    • Duplicated patterns / reinvented systems                    ║
║    • Unnecessary fallbacks / backwards-compatibility shims       ║
║                                                                  ║
║  The commit will proceed once the check passes.                  ║
╚══════════════════════════════════════════════════════════════════╝
MSG

exit 1
