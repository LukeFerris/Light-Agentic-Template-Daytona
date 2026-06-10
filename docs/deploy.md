# Production deploy (AWS Fargate)

Production runs the **same container images** built for local/dev — only as
immutable artifacts on AWS Fargate, wired together with an ALB and service
discovery, and pointed at real AWS services instead of the dev mocks.

```bash
yarn deploy      # build + smoke-test + push images, then apply the stack
yarn teardown    # destroy everything the deploy created
```

## What gets deployed

```
                  Internet
                     │  :80
            ┌────────▼─────────┐
            │  Application LB   │
            └──┬────────────┬───┘
   default ──► │            │ ◄── path: /hello, /storage, /health
   (SPA)       │            │
        ┌──────▼─────┐  ┌───▼────────┐
        │ frontend   │  │ backend    │   ECS Fargate services
        │ (nginx)    │  │ (node)     │   in the default VPC
        └────────────┘  └─────┬──────┘
                              │ IAM task role
                        ┌─────▼──────┐
                        │  real S3   │   (app bucket)
                        └────────────┘
```

- **Two ECS Fargate services** — `frontend` (nginx, port 80) and `backend`
  (the Node server, port 3000) — one task each, in the account's **default VPC**
  public subnets with a public IP (so they can pull from ECR and reach AWS with
  no NAT gateway).
- **Application Load Balancer** on port 80. The default rule serves the frontend
  SPA; a higher-priority rule forwards the API paths (`/hello`, `/storage`,
  `/health`) to the backend. The browser therefore reaches the API
  **same-origin**, so no CORS configuration is needed (the frontend ships with
  `API_URL=""`).
- **Service discovery (Cloud Map)** registers the backend as
  `backend.<project>.local` inside the VPC, giving services a stable internal
  name to reach each other by.
- **ECR** holds the immutable `frontend` and `backend` images, tagged by git
  commit. Fargate runs exactly the artifacts that were smoke-tested.
- **Real S3** replaces the MinIO mock. The backend runs with no `S3_ENDPOINT`,
  so the S3 client targets AWS S3 and authenticates via the **task IAM role**
  (which is granted access to the app bucket). This is the only difference from
  local — configuration, not code. See [aws-mocks.md](aws-mocks.md).

## How `yarn deploy` works

1. **Terraform creates the ECR repositories** (targeted apply) so there is
   somewhere to push to.
2. **Build** the `frontend` and `backend` images from their Dockerfiles, tagged
   `:<git-short-sha>` (immutable repos — re-deploying the same commit reuses the
   already-published image).
3. **Smoke-test each built image locally** — the exact artifact that ships is
   started and probed (`/health` for the backend, `/` for the frontend) before
   it is allowed anywhere near production.
4. **Push** the images to ECR.
5. **Terraform applies the full stack** with the pushed image references, so the
   ECS services run those exact artifacts.

The app URL is printed at the end. ECS tasks take a minute or two to start and
pass health checks; an initial `503` from the ALB is expected.

## Requirements

- Docker running locally (to build and smoke-test the images).
- AWS credentials with permission to manage ECR, ECS, ELB, IAM, CloudWatch
  Logs, S3, and Cloud Map (`aws configure` or `AWS_*` env vars).
- Terraform and the AWS CLI (`./scripts/install-infra-tools.sh`).

## Teardown

`yarn teardown` runs `terraform destroy`, removing every resource. The ECR
repositories (`force_delete`) and the app S3 bucket (`force_destroy`) are
configured so destroy succeeds even when they still hold images/objects.

## Configuration

Defaults are derived automatically (project name from the repo directory, a
random environment id, region `us-east-1`). Override via Terraform variables in
`deployment/` if needed — e.g. `aws_region`, `project_name`, task `*_cpu` /
`*_memory`, or `desired_count`.
