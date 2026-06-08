#!/bin/bash

echo "========================================="
echo "Verifying Pre-Commit Setup"
echo "========================================="
echo ""

ERRORS=0

# Check for required files
echo "Checking configuration files..."

FILES=(
    "package.json"
    ".secretlintrc.json"
    ".secretlintignore"
    "eslint.config.js"
    "tsconfig.json"
    ".husky/pre-commit"
    "scripts/security/check-sast.sh"
    "scripts/security/check-dependencies.sh"
    "scripts/security/install-security-tools.sh"
    "scripts/check-staged-coverage.mjs"
)

for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "✓ $file"
    else
        echo "✗ $file (missing)"
        ERRORS=$((ERRORS + 1))
    fi
done

echo ""
echo "Checking npm dependencies..."

DEPS=(
    "husky"
    "lint-staged"
    "secretlint"
    "@secretlint/secretlint-rule-preset-recommend"
    "eslint"
    "@typescript-eslint/eslint-plugin"
    "@typescript-eslint/parser"
    "eslint-plugin-security"
    "eslint-plugin-sonarjs"
    "typescript"
    "vitest"
)

for dep in "${DEPS[@]}"; do
    if [ -d "node_modules/$dep" ]; then
        echo "✓ $dep"
    else
        echo "✗ $dep (not installed)"
        ERRORS=$((ERRORS + 1))
    fi
done

echo ""
echo "Checking external security tools..."

if command -v semgrep &> /dev/null; then
    echo "✓ semgrep ($(semgrep --version))"
else
    echo "✗ semgrep (not installed)"
    echo "  Install with: brew install semgrep"
    ERRORS=$((ERRORS + 1))
fi

if command -v osv-scanner &> /dev/null; then
    echo "✓ osv-scanner ($(osv-scanner --version 2>&1 | head -n 1))"
else
    echo "✗ osv-scanner (not installed)"
    echo "  Install with: brew install osv-scanner"
    ERRORS=$((ERRORS + 1))
fi

echo ""
echo "Checking git hooks..."

if [ -x ".husky/pre-commit" ]; then
    echo "✓ pre-commit hook is executable"
else
    echo "✗ pre-commit hook is not executable"
    ERRORS=$((ERRORS + 1))
fi

echo ""
echo "========================================="

if [ $ERRORS -eq 0 ]; then
    echo "✓ Setup verification complete!"
    echo "========================================="
    echo ""
    echo "All checks passed. Your pre-commit hooks are ready to use."
    exit 0
else
    echo "✗ Setup verification failed with $ERRORS error(s)"
    echo "========================================="
    echo ""
    echo "Please fix the errors above and run this script again."
    exit 1
fi
