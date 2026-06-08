#!/bin/bash

# Deploy frontend only: build + S3 upload + CloudFront invalidation
# Usage: bash scripts/deploy/deploy-frontend.sh

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || {
    echo "<deploy-output>"
    echo "<status>failed</status>"
    echo "<error>Not inside a git repository.</error>"
    echo "</deploy-output>"
    exit 1
}

DEPLOY_DIR="$REPO_ROOT/deployment"

echo ""
echo "========================================="
echo "  Frontend Deploy: Starting..."
echo "========================================="
echo ""

# --- Preflight ---

if ! command -v aws &> /dev/null; then
    echo "<deploy-output>"
    echo "<status>failed</status>"
    echo "<error>AWS CLI is not installed.</error>"
    echo "<llm-instruction>Run ./scripts/install-infra-tools.sh to install AWS CLI, then retry.</llm-instruction>"
    echo "</deploy-output>"
    exit 1
fi

if ! command -v terraform &> /dev/null; then
    echo "<deploy-output>"
    echo "<status>failed</status>"
    echo "<error>Terraform is not installed (needed to read outputs).</error>"
    echo "<llm-instruction>Run ./scripts/install-infra-tools.sh to install Terraform, then retry.</llm-instruction>"
    echo "</deploy-output>"
    exit 1
fi

# --- Check infrastructure exists ---

cd "$DEPLOY_DIR" || exit 1

if [ ! -f "terraform.tfstate" ] && [ ! -d ".terraform" ]; then
    echo "<deploy-output>"
    echo "<status>failed</status>"
    echo "<error>Infrastructure not deployed yet. Run 'yarn deploy' first to create the AWS resources.</error>"
    echo "<llm-instruction>Tell the user to run 'yarn deploy' first to create the infrastructure.</llm-instruction>"
    echo "</deploy-output>"
    exit 1
fi

# --- Extract outputs from existing state ---

S3_BUCKET=$(terraform output -raw s3_bucket_name 2>/dev/null || echo "")
CF_DISTRIBUTION_ID=$(terraform output -raw cloudfront_distribution_id 2>/dev/null || echo "")
FRONTEND_URL=$(terraform output -raw frontend_url 2>/dev/null || echo "UNAVAILABLE")
API_URL=$(terraform output -raw api_url 2>/dev/null || echo "UNAVAILABLE")

if [ -z "$S3_BUCKET" ]; then
    echo "<deploy-output>"
    echo "<status>failed</status>"
    echo "<error>Could not determine S3 bucket from Terraform state. Run 'yarn deploy' first.</error>"
    echo "</deploy-output>"
    exit 1
fi

# --- Build frontend ---

echo "Building frontend..."
cd "$REPO_ROOT" || exit 1
if ! yarn workspace frontend build 2>&1; then
    echo "<deploy-output>"
    echo "<status>failed</status>"
    echo "<error>Frontend build failed.</error>"
    echo "<llm-instruction>Fix the build errors shown above, then retry: yarn deploy:frontend</llm-instruction>"
    echo "</deploy-output>"
    exit 1
fi
echo ""

# --- Upload to S3 ---

echo "Uploading frontend to S3 ($S3_BUCKET)..."
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

# --- CloudFront invalidation ---

if [ -n "$CF_DISTRIBUTION_ID" ] && [ "$CF_DISTRIBUTION_ID" != "UNAVAILABLE" ]; then
    echo "Invalidating CloudFront cache..."
    aws cloudfront create-invalidation \
        --distribution-id "$CF_DISTRIBUTION_ID" \
        --paths "/*" 2>&1 || echo "WARNING: CloudFront cache invalidation failed (non-fatal)."
    echo ""
fi

# --- Done ---

echo "========================================="
echo "  Frontend Deployed!"
echo "========================================="
echo ""
echo "  Frontend URL: $FRONTEND_URL"
echo ""
echo "<deploy-output>"
echo "<status>success</status>"
echo "<frontend-url>$FRONTEND_URL</frontend-url>"
echo "<llm-instruction>Frontend deployed successfully. URL: $FRONTEND_URL</llm-instruction>"
echo "</deploy-output>"
