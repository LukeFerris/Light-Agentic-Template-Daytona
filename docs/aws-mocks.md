# AWS service mocks

> This is the canonical **Pattern A (mockable service)** example for the
> repo-wide policy in [external-services.md](external-services.md). Read that
> first to decide whether a new dependency belongs here or in the required-real
> tier.

Every AWS service the app depends on has an **identical-functional mock that
runs as a container** for local/dev/test. The same application code talks to the
mock and to real AWS — the difference is **configuration only, never a code
branch**.

This means the whole stack runs fully offline (`docker compose up`), and the
exact same build is promoted to production by changing environment variables.

## Services and their mocks

| AWS service | Mock container | Why |
| ----------- | -------------- | --- |
| S3          | [MinIO](https://min.io) | Speaks the S3 API, so the AWS SDK client talks to it unchanged. |

When the app takes on another AWS dependency, add its mock the same way: a
container in `docker-compose.yml`, a config-only client factory under
`packages/backend/src/services/aws/`, and a row in this table.

## How the switch works (S3)

The S3 client is built in one place —
[`packages/backend/src/services/aws/s3Client.ts`](../packages/backend/src/services/aws/s3Client.ts):

- **`S3_ENDPOINT` is set** → the client targets that endpoint with path-style
  addressing (required by S3-compatible mocks). This is dev/test against MinIO.
- **`S3_ENDPOINT` is unset** → the client targets real AWS S3 using the default
  endpoint and the standard credential provider chain (an IAM role on Fargate).
  This is production.

Application code (`storageService.ts`, handlers) never knows which one it is
talking to.

### Configuration

| Variable | Mock (compose) | Real AWS (prod) |
| -------- | -------------- | --------------- |
| `S3_ENDPOINT` | `http://minio:9000` | _unset_ |
| `S3_BUCKET` | `app-bucket` | your bucket name |
| `AWS_REGION` | `us-east-1` | your region |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | `minioadmin` / `minioadmin` | provided by the task IAM role |

## Running offline

```bash
docker compose up --build
```

This starts `minio` (the S3 mock), a one-shot `minio-setup` job that creates the
`app-bucket` bucket, then the `backend` and `frontend`. The MinIO console is at
<http://localhost:9001> (user/password `minioadmin`).

Try the S3-backed endpoint — it round-trips through the mock with no AWS account:

```bash
# Store a value
curl -X POST http://localhost:3000/storage \
  -H 'Content-Type: application/json' \
  -d '{"key":"greeting","value":"hello"}'

# Read it back
curl 'http://localhost:3000/storage?key=greeting'
# -> {"key":"greeting","value":"hello"}
```

## Pointing at real AWS

Remove `S3_ENDPOINT` (and the MinIO credentials) from the environment and supply
a real `S3_BUCKET` / `AWS_REGION` plus credentials (or an IAM role). No code or
image change is needed.

> The single-image build (`Dockerfile`) bundles only the app, not MinIO. Run it
> against real AWS S3 or an externally-reachable mock by passing the same
> environment variables.
