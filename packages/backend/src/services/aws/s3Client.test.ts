import { describe, expect, it } from 'vitest';
import { buildS3ClientConfig, getBucketName, getS3Client } from './s3Client';

describe('buildS3ClientConfig', () => {
  it('targets a custom endpoint with path-style addressing when S3_ENDPOINT is set (mock)', () => {
    const config = buildS3ClientConfig({
      AWS_REGION: 'eu-west-1',
      S3_ENDPOINT: 'http://minio:9000',
    });

    expect(config).toEqual({
      region: 'eu-west-1',
      endpoint: 'http://minio:9000',
      forcePathStyle: true,
    });
  });

  it('targets real AWS (no endpoint, virtual-host style) when S3_ENDPOINT is absent (prod)', () => {
    const config = buildS3ClientConfig({ AWS_REGION: 'us-west-2' });

    expect(config).toEqual({ region: 'us-west-2' });
    expect(config).not.toHaveProperty('endpoint');
    expect(config).not.toHaveProperty('forcePathStyle');
  });

  it('defaults the region to us-east-1 when AWS_REGION is unset', () => {
    expect(buildS3ClientConfig({})).toEqual({ region: 'us-east-1' });
  });
});

describe('getBucketName', () => {
  it('returns the configured bucket name', () => {
    expect(getBucketName({ S3_BUCKET: 'my-bucket' })).toBe('my-bucket');
  });

  it('defaults to app-bucket when S3_BUCKET is unset', () => {
    expect(getBucketName({})).toBe('app-bucket');
  });
});

describe('getS3Client', () => {
  it('returns the same cached client instance across calls', () => {
    expect(getS3Client()).toBe(getS3Client());
  });
});
