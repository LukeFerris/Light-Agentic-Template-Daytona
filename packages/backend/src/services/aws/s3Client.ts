import { S3Client, type S3ClientConfig } from '@aws-sdk/client-s3';

/**
 * Builds the S3 client configuration from environment variables.
 *
 * This is the single point where the app chooses between a containerized mock
 * (e.g. MinIO/LocalStack) and real AWS S3 — by config only, never by branching
 * in application logic:
 *
 * - When `S3_ENDPOINT` is set, the client targets that endpoint with path-style
 *   addressing, which S3-compatible mocks require. This is how dev/test talk to
 *   the mock container.
 * - When `S3_ENDPOINT` is absent, the client targets real AWS using the default
 *   endpoint and the standard credential provider chain (IAM role on Fargate,
 *   env vars locally). This is production.
 *
 * Credentials are always read by the SDK from the standard environment (the
 * `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` env vars or an IAM role), so no
 * credentials are hard-coded here.
 *
 * @param env - Environment variables to read configuration from
 * @returns S3 client configuration
 */
export function buildS3ClientConfig(
  env: NodeJS.ProcessEnv = process.env,
): S3ClientConfig {
  const region = env.AWS_REGION ?? 'us-east-1';
  const endpoint = env.S3_ENDPOINT;

  if (endpoint) {
    return { region, endpoint, forcePathStyle: true };
  }

  return { region };
}

/**
 * Returns the configured S3 bucket name.
 * @param env - Environment variables to read configuration from
 * @returns Bucket name from `S3_BUCKET`, defaulting to `app-bucket`
 */
export function getBucketName(env: NodeJS.ProcessEnv = process.env): string {
  return env.S3_BUCKET ?? 'app-bucket';
}

let cachedClient: S3Client | undefined;

/**
 * Returns a lazily-created, process-wide S3 client built from the environment.
 * The same client is reused across invocations to avoid re-creating connections.
 * @returns A configured S3 client
 */
export function getS3Client(): S3Client {
  if (!cachedClient) {
    cachedClient = new S3Client(buildS3ClientConfig());
  }
  return cachedClient;
}
