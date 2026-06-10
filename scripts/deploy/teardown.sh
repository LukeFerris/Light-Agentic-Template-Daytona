#!/bin/bash

# Tear down the Fargate deployment, removing every AWS resource this stack created.
#
# ECR repositories (force_delete) and the app S3 bucket (force_destroy) are
# configured so destroy succeeds even when they still hold images/objects.
#
# Usage: bash scripts/deploy/teardown.sh

set -uo pipefail

emit_failure() {
    echo ""
    echo "<teardown-output>"
    echo "<status>failed</status>"
    echo "<error>$1</error>"
    echo "<llm-instruction>$2</llm-instruction>"
    echo "</teardown-output>"
    exit 1
}

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || \
    emit_failure "Not inside a git repository." "Run this script from within the git repository."

DEPLOY_DIR="$REPO_ROOT/deployment"

echo ""
echo "========================================="
echo "  Fargate Teardown: Starting..."
echo "========================================="
echo ""

for tool in terraform aws; do
    if ! command -v "$tool" &> /dev/null; then
        emit_failure "$tool is not installed." "Install $tool, then retry."
    fi
done

cd "$DEPLOY_DIR" || emit_failure "Could not enter deployment directory." "Unexpected filesystem error."

if [ ! -f "terraform.tfstate" ] && [ ! -d ".terraform" ]; then
    echo "Nothing to tear down (no Terraform state found)."
    echo ""
    echo "<teardown-output>"
    echo "<status>success</status>"
    echo "<llm-instruction>There was no deployment to tear down.</llm-instruction>"
    echo "</teardown-output>"
    exit 0
fi

if ! aws sts get-caller-identity &> /dev/null; then
    emit_failure "AWS credentials are not configured or invalid." "Run 'aws configure' (or set AWS_* env vars), then retry: yarn teardown"
fi

echo "Destroying all resources..."
# Image vars are irrelevant to destroy; defaults are fine.
terraform destroy -auto-approve -input=false -no-color || \
    emit_failure "terraform destroy failed." "Review the terraform error above and retry: yarn teardown"

echo ""
echo "========================================="
echo "  Teardown Complete"
echo "========================================="
echo ""
echo "<teardown-output>"
echo "<status>success</status>"
echo "<llm-instruction>All Fargate deployment resources have been removed.</llm-instruction>"
echo "</teardown-output>"
