#!/bin/bash

# Deploy API only: build backend + update Lambda function code
# Usage: bash scripts/deploy/deploy-api.sh

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
echo "  API Deploy: Starting..."
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

# --- Extract Lambda function name from state ---

LAMBDA_NAME=$(terraform output -raw lambda_function_name 2>/dev/null || echo "")
API_URL=$(terraform output -raw api_url 2>/dev/null || echo "UNAVAILABLE")
AWS_REGION=$(terraform output -raw aws_region 2>/dev/null || echo "us-east-1")

if [ -z "$LAMBDA_NAME" ]; then
    echo "<deploy-output>"
    echo "<status>failed</status>"
    echo "<error>Could not determine Lambda function name from Terraform state. Run 'yarn deploy' first.</error>"
    echo "</deploy-output>"
    exit 1
fi

# --- Build backend ---

echo "Building backend..."
cd "$REPO_ROOT" || exit 1
if ! yarn workspace backend build 2>&1; then
    echo "<deploy-output>"
    echo "<status>failed</status>"
    echo "<error>Backend build failed.</error>"
    echo "<llm-instruction>Fix the build errors shown above, then retry: yarn deploy:api</llm-instruction>"
    echo "</deploy-output>"
    exit 1
fi
echo ""

# --- Package and update Lambda ---

echo "Packaging Lambda function..."
cd "$REPO_ROOT/packages/backend/dist" || exit 1
zip -j /tmp/lambda_payload.zip index.js 2>&1
echo ""

echo "Updating Lambda function: $LAMBDA_NAME..."
if ! aws lambda update-function-code \
    --function-name "$LAMBDA_NAME" \
    --zip-file "fileb:///tmp/lambda_payload.zip" \
    --region "$AWS_REGION" 2>&1; then
    echo "<deploy-output>"
    echo "<status>failed</status>"
    echo "<error>Failed to update Lambda function code.</error>"
    echo "<llm-instruction>"
    echo "Lambda update failed. Check:"
    echo "  - AWS credentials are configured and valid"
    echo "  - IAM permissions include lambda:UpdateFunctionCode"
    echo "  - The function $LAMBDA_NAME exists in region $AWS_REGION"
    echo "</llm-instruction>"
    echo "</deploy-output>"
    rm -f /tmp/lambda_payload.zip
    exit 1
fi

rm -f /tmp/lambda_payload.zip
echo ""

# --- Done ---

echo "========================================="
echo "  API Deployed!"
echo "========================================="
echo ""
echo "  Lambda Function: $LAMBDA_NAME"
echo "  API URL: $API_URL"
echo ""
echo "<deploy-output>"
echo "<status>success</status>"
echo "<api-url>$API_URL</api-url>"
echo "<lambda-function>$LAMBDA_NAME</lambda-function>"
echo "<llm-instruction>API deployed successfully. URL: $API_URL</llm-instruction>"
echo "</deploy-output>"
