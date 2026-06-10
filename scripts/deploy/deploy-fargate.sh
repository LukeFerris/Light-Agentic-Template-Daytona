#!/bin/bash

# Deploy the full app to AWS Fargate as multiple communicating containers.
#
# Flow:
#   1. Terraform creates the ECR repositories (and the rest of the stack scaffolding).
#   2. Build the immutable frontend + backend images, tagged by git commit.
#   3. Smoke-test each built image locally (the exact artifact that ships).
#   4. Push the images to ECR.
#   5. Terraform applies the full stack, running those pushed images on Fargate
#      behind an ALB, wired together with service discovery and pointed at real AWS S3.
#
# Usage: bash scripts/deploy/deploy-fargate.sh

set -uo pipefail

emit_failure() {
    # $1 = error message, $2 = llm instruction
    echo ""
    echo "<deploy-output>"
    echo "<status>failed</status>"
    echo "<error>$1</error>"
    echo "<llm-instruction>$2</llm-instruction>"
    echo "</deploy-output>"
    exit 1
}

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || \
    emit_failure "Not inside a git repository." "Run this script from within the git repository."

DEPLOY_DIR="$REPO_ROOT/deployment"
LOCK_FILE="$DEPLOY_DIR/.deploy.lock"

if [ ! -d "$DEPLOY_DIR" ]; then
    emit_failure "Deployment directory not found: $DEPLOY_DIR" "The deployment/ directory is missing. Check the repository structure."
fi

echo ""
echo "========================================="
echo "  Fargate Deploy: Starting..."
echo "========================================="
echo ""

# --- Preflight checks ---

for tool in terraform aws docker git; do
    if ! command -v "$tool" &> /dev/null; then
        emit_failure "$tool is not installed." "Install $tool, then retry. Terraform/AWS CLI: ./scripts/install-infra-tools.sh"
    fi
done

if ! docker info &> /dev/null; then
    emit_failure "Docker daemon is not running." "Start Docker (e.g. Docker Desktop), then retry: yarn deploy"
fi

if ! aws sts get-caller-identity &> /dev/null; then
    emit_failure "AWS credentials are not configured or invalid." "Run 'aws configure' (or set AWS_* env vars) with credentials that can manage ECR/ECS/ELB/IAM/S3, then retry."
fi

# --- Acquire deploy lock ---

if ! mkdir "$LOCK_FILE" 2>/dev/null; then
    emit_failure "Another deployment is already in progress." "Wait for the in-progress deployment to finish (or remove $LOCK_FILE if stale), then retry."
fi
cleanup() { rm -rf "$LOCK_FILE"; }
trap cleanup EXIT

# --- Image tag: pin to the committed source so Fargate runs an immutable, traceable artifact ---

cd "$REPO_ROOT" || emit_failure "Could not enter repo root." "Unexpected filesystem error."

TAG="$(git rev-parse --short HEAD)"
if [ -n "$(git status --porcelain)" ]; then
    echo "WARNING: working tree has uncommitted changes; tagging image as '$TAG-dirty'."
    echo "         Commit your work so the deployed image matches a real commit."
    TAG="$TAG-dirty"
fi
echo "Image tag: $TAG"
echo ""

# --- Terraform init + create ECR repositories first ---

cd "$DEPLOY_DIR" || emit_failure "Could not enter deployment directory." "Unexpected filesystem error."

if [ ! -d ".terraform" ]; then
    echo "Initializing Terraform..."
    terraform init -input=false -no-color || \
        emit_failure "terraform init failed." "Check provider configuration and network connectivity, then retry."
    echo ""
fi

echo "Creating container registries..."
terraform apply -auto-approve -input=false -no-color \
    -target=aws_ecr_repository.frontend \
    -target=aws_ecr_repository.backend || \
    emit_failure "Failed to create ECR repositories." "Check the terraform error above (credentials/permissions), then retry."
echo ""

ECR_FRONTEND="$(terraform output -raw ecr_frontend_url 2>/dev/null)"
ECR_BACKEND="$(terraform output -raw ecr_backend_url 2>/dev/null)"
REGION="$(terraform output -raw aws_region 2>/dev/null || echo "us-east-1")"

if [ -z "$ECR_FRONTEND" ] || [ -z "$ECR_BACKEND" ]; then
    emit_failure "Could not read ECR repository URLs from Terraform outputs." "Re-run the deploy; if it persists, inspect 'terraform output' in the deployment/ directory."
fi

REGISTRY="${ECR_BACKEND%%/*}"

echo "Logging in to ECR ($REGISTRY)..."
aws ecr get-login-password --region "$REGION" | \
    docker login --username AWS --password-stdin "$REGISTRY" || \
    emit_failure "Docker login to ECR failed." "Check AWS credentials and ECR permissions, then retry."
echo ""

# --- Build, smoke-test, and push one image ---
# Args: <repo-url> <dockerfile> <local-smoke-port> <container-port> <health-path>

build_push_image() {
    local repo_url="$1" dockerfile="$2" smoke_port="$3" container_port="$4" health_path="$5"
    local repo_name="${repo_url#*/}"
    local image_ref="$repo_url:$TAG"
    local cname="smoke-$repo_name-$TAG"
    cname="${cname//[^a-zA-Z0-9_.-]/-}"

    # Immutable repos reject re-pushing an existing tag. If this exact artifact is
    # already published, reuse it (idempotent redeploys of the same commit).
    if aws ecr describe-images --region "$REGION" \
        --repository-name "$repo_name" --image-ids "imageTag=$TAG" &> /dev/null; then
        echo "Image $image_ref already published; reusing it."
        echo ""
        return 0
    fi

    echo "Building $image_ref ..."
    # Fargate runs linux/amd64; build for that platform regardless of host arch.
    docker build --platform linux/amd64 -f "$REPO_ROOT/$dockerfile" -t "$image_ref" "$REPO_ROOT" || \
        emit_failure "docker build failed for $dockerfile." "Fix the build error above, then retry: yarn deploy"

    echo "Smoke-testing $image_ref ..."
    docker rm -f "$cname" &> /dev/null || true
    docker run -d --platform linux/amd64 --name "$cname" -p "$smoke_port:$container_port" "$image_ref" &> /dev/null || \
        emit_failure "Could not start $image_ref for smoke test." "Inspect the image locally: docker run --rm -p $smoke_port:$container_port $image_ref"

    local ok=""
    for _ in $(seq 1 30); do
        if curl -fsS "http://localhost:$smoke_port$health_path" &> /dev/null; then
            ok="yes"
            break
        fi
        sleep 1
    done

    docker logs "$cname" 2>&1 | tail -20
    docker rm -f "$cname" &> /dev/null || true

    if [ -z "$ok" ]; then
        emit_failure "Smoke test failed: $image_ref did not answer $health_path." "The built image is unhealthy. Check the container logs above before deploying."
    fi
    echo "Smoke test passed ($health_path)."

    echo "Pushing $image_ref ..."
    docker push "$image_ref" || \
        emit_failure "docker push failed for $image_ref." "Check ECR permissions/connectivity, then retry."
    echo ""
}

build_push_image "$ECR_BACKEND" "packages/backend/Dockerfile" 13000 3000 "/health"
build_push_image "$ECR_FRONTEND" "packages/frontend/Dockerfile" 18080 80 "/"

# --- Apply the full stack with the pushed images ---

echo "Deploying the stack to Fargate..."
terraform apply -auto-approve -input=false -no-color \
    -var "backend_image=$ECR_BACKEND:$TAG" \
    -var "frontend_image=$ECR_FRONTEND:$TAG" || \
    emit_failure "terraform apply failed." "Review the terraform error above (credentials/permissions/quota), fix, then retry: yarn deploy"
echo ""

APP_URL="$(terraform output -raw app_url 2>/dev/null || echo "UNAVAILABLE")"

echo "========================================="
echo "  Deployment Successful!"
echo "========================================="
echo ""
echo "  App URL: $APP_URL"
echo ""
echo "  Note: ECS tasks take a minute or two to start and pass health checks."
echo "  If the URL 503s at first, wait and refresh."
echo ""
echo "<deploy-output>"
echo "<status>success</status>"
echo "<app-url>$APP_URL</app-url>"
echo "<llm-instruction>"
echo "Report deployment success to the user. The full app (frontend + same-origin API)"
echo "is served at: $APP_URL"
echo "Tasks may take 1-2 minutes to become healthy; an initial 503 is expected."
echo "Tear it all down with: yarn teardown"
echo "</llm-instruction>"
echo "</deploy-output>"
