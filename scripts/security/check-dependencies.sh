#!/bin/bash
set -e

if ! command -v osv-scanner &> /dev/null; then
    echo "ERROR: osv-scanner is not installed."
    echo "Install with: brew install osv-scanner"
    echo "Or run: ./scripts/security/install-security-tools.sh"
    exit 1
fi

FILES="$@"
if [ -z "$FILES" ]; then
    echo "No lockfiles to scan."
    exit 0
fi

echo "Scanning dependency lockfiles for vulnerabilities..."

OVERALL_RESULT=0
for FILE in $FILES; do
    if [[ "$FILE" == *"lock"* ]]; then
        echo "Scanning: $FILE"
        SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
        PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
        CONFIG_FLAG=""
        if [ -f "$PROJECT_ROOT/.osv-scanner.toml" ]; then
            CONFIG_FLAG="--config=$PROJECT_ROOT/.osv-scanner.toml"
        fi
        osv-scanner scan --lockfile "$FILE" --format table $CONFIG_FLAG
        if [ $? -ne 0 ]; then
            OVERALL_RESULT=1
        fi
    fi
done

if [ $OVERALL_RESULT -ne 0 ]; then
    echo ""
    echo "========================================="
    echo "VULNERABILITIES FOUND!"
    echo "========================================="
    echo "Please review the dependency issues above."
    echo ""
    echo "To fix:"
    echo "  1. Update vulnerable dependencies: yarn upgrade"
    echo "  2. Check for security advisories: yarn audit"
    echo "  3. Review and update package versions"
    echo "========================================="
    exit 1
fi

echo "✓ No known vulnerabilities found in dependency lockfiles."
exit 0
