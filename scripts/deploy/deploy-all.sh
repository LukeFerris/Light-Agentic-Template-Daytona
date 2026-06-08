#!/bin/bash

# Deploy everything: infrastructure + frontend + API
# Usage: bash scripts/deploy/deploy-all.sh

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || {
    echo "<deploy-output>"
    echo "<status>failed</status>"
    echo "<error>Not inside a git repository.</error>"
    echo "<llm-instruction>Report to the user that this script must be run from within the git repository.</llm-instruction>"
    echo "</deploy-output>"
    exit 1
}

DEPLOY_DIR="$REPO_ROOT/deployment"

if [ ! -d "$DEPLOY_DIR" ]; then
    echo "<deploy-output>"
    echo "<status>failed</status>"
    echo "<error>Deployment directory not found: $DEPLOY_DIR</error>"
    echo "<llm-instruction>The deployment/ directory is missing. Check the repository structure.</llm-instruction>"
    echo "</deploy-output>"
    exit 1
fi

LOCK_FILE="$DEPLOY_DIR/.deploy.lock"

cleanup() {
    rm -rf "$LOCK_FILE"
}
trap cleanup EXIT

echo ""
echo "========================================="
echo "  Full Deploy: Starting..."
echo "========================================="
echo ""

# --- Preflight checks ---

if ! command -v terraform &> /dev/null; then
    echo "<deploy-output>"
    echo "<status>failed</status>"
    echo "<error>Terraform is not installed.</error>"
    echo "<llm-instruction>Run ./scripts/install-infra-tools.sh to install Terraform, then retry.</llm-instruction>"
    echo "</deploy-output>"
    exit 1
fi

if ! command -v aws &> /dev/null; then
    echo "<deploy-output>"
    echo "<status>failed</status>"
    echo "<error>AWS CLI is not installed.</error>"
    echo "<llm-instruction>Run ./scripts/install-infra-tools.sh to install AWS CLI, then retry.</llm-instruction>"
    echo "</deploy-output>"
    exit 1
fi

# --- Build all packages ---

echo "Building all packages..."
cd "$REPO_ROOT" || exit 1
if ! yarn build 2>&1; then
    echo "<deploy-output>"
    echo "<status>failed</status>"
    echo "<error>yarn build failed.</error>"
    echo "<llm-instruction>Fix the build errors shown above, then retry: yarn deploy</llm-instruction>"
    echo "</deploy-output>"
    exit 1
fi
echo ""

# --- Acquire deploy lock ---

if ! mkdir "$LOCK_FILE" 2>/dev/null; then
    echo "<deploy-output>"
    echo "<status>failed</status>"
    echo "<error>Another deployment is already in progress.</error>"
    echo "<llm-instruction>Wait for the in-progress deployment to finish before retrying.</llm-instruction>"
    echo "</deploy-output>"
    exit 1
fi

# --- Terraform init (if needed) ---

cd "$DEPLOY_DIR" || exit 1

if [ ! -d ".terraform" ]; then
    echo "Initializing Terraform..."
    if ! terraform init -input=false 2>&1; then
        echo "<deploy-output>"
        echo "<status>failed</status>"
        echo "<error>terraform init failed.</error>"
        echo "<llm-instruction>Check provider configuration and network connectivity. Fix .tf files if needed and retry.</llm-instruction>"
        echo "</deploy-output>"
        exit 1
    fi
    echo ""
fi

# --- Terraform apply ---

echo "Applying Terraform changes..."
echo ""

APPLY_LOG=$(mktemp /tmp/deploy-apply-XXXXXX.log)
terraform apply -auto-approve -input=false 2>&1 | tee "$APPLY_LOG"
APPLY_EXIT_CODE=${PIPESTATUS[0]}

if [ $APPLY_EXIT_CODE -ne 0 ]; then
    echo ""
    echo "<deploy-output>"
    echo "<status>failed</status>"
    echo "<error>terraform apply failed. See output above.</error>"
    echo "<llm-instruction>"
    echo "Analyze the terraform error output above:"
    echo "  - CREDENTIALS error: tell user to configure AWS credentials (aws configure)"
    echo "  - PERMISSIONS error: tell user which IAM permissions are needed"
    echo "  - CONFIG error: fix the .tf files and retry"
    echo "  - RESOURCE CONFLICT: attempt terraform import or config fix"
    echo "</llm-instruction>"
    echo "</deploy-output>"
    rm -f "$APPLY_LOG"
    exit 1
fi
rm -f "$APPLY_LOG"

echo ""

# --- Extract outputs ---

FRONTEND_URL=$(terraform output -raw frontend_url 2>/dev/null || echo "UNAVAILABLE")
API_URL=$(terraform output -raw api_url 2>/dev/null || echo "UNAVAILABLE")
CF_DISTRIBUTION_ID=$(terraform output -raw cloudfront_distribution_id 2>/dev/null || echo "")
S3_BUCKET=$(terraform output -raw s3_bucket_name 2>/dev/null || echo "")

# --- Upload frontend to S3 ---

if [ -n "$S3_BUCKET" ] && [ -d "$REPO_ROOT/packages/frontend/dist" ]; then
    echo "Uploading frontend to S3..."
    aws s3 sync "$REPO_ROOT/packages/frontend/dist" "s3://$S3_BUCKET" --delete 2>&1

    # Upload config.json with API URL
    if [ "$API_URL" != "UNAVAILABLE" ]; then
        CONFIG_JSON=$(mktemp /tmp/config-XXXXXX.json)
        printf '{"apiUrl":"%s"}' "$API_URL" > "$CONFIG_JSON"
        aws s3 cp "$CONFIG_JSON" "s3://$S3_BUCKET/config.json" \
            --content-type "application/json" \
            --cache-control "no-cache, no-store, must-revalidate" 2>&1
        rm -f "$CONFIG_JSON"
    fi
    echo ""
fi

# --- CloudFront cache invalidation ---

if [ -n "$CF_DISTRIBUTION_ID" ] && [ "$CF_DISTRIBUTION_ID" != "UNAVAILABLE" ]; then
    echo "Invalidating CloudFront cache..."
    aws cloudfront create-invalidation \
        --distribution-id "$CF_DISTRIBUTION_ID" \
        --paths "/*" 2>&1 || echo "WARNING: CloudFront cache invalidation failed (non-fatal)."
    echo ""
fi

# --- Output results ---

echo "========================================="
echo "  Deployment Successful!"
echo "========================================="
echo ""
echo "  Frontend URL: $FRONTEND_URL"
echo "  Backend API URL: $API_URL"
echo ""
echo "<deploy-output>"
echo "<status>success</status>"
echo "<frontend-url>$FRONTEND_URL</frontend-url>"
echo "<api-url>$API_URL</api-url>"
echo "<llm-instruction>"
echo "Report deployment success to the user with these URLs:"
echo "  - Frontend: $FRONTEND_URL"
echo "  - API: $API_URL"
echo "</llm-instruction>"
echo "</deploy-output>"
