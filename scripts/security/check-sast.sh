#!/bin/bash
set -e

if ! command -v semgrep &> /dev/null; then
    echo "ERROR: semgrep is not installed."
    echo "Install with: brew install semgrep"
    echo "Or run: ./scripts/security/install-security-tools.sh"
    exit 1
fi

FILES="$@"
if [ -z "$FILES" ]; then
    echo "No files to scan for SAST."
    exit 0
fi

echo "Running SAST scan on staged files..."

# Run semgrep with OWASP Top 10 and TypeScript security rules
OUTPUT=$(semgrep scan \
    --config "p/owasp-top-ten" \
    --config "p/typescript" \
    --error \
    --metrics off \
    --timeout 30 \
    $FILES 2>&1) || {
    RESULT=$?
    # Check if the error is due to network issues
    if echo "$OUTPUT" | grep -q "Failed to resolve\|ConnectionError\|No address associated with hostname"; then
        echo "⚠️  WARNING: Cannot reach semgrep.dev (network restricted environment)"
        echo "Skipping remote rule fetching. Commit will proceed."
        echo "Security scanning should be performed in CI/CD pipeline."
        exit 0
    fi
    # If it's not a network error, show the output and fail
    echo "$OUTPUT"
    exit $RESULT
}

echo "$OUTPUT"
echo "✓ No SAST issues found in staged files."
exit 0
