import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import type { S3Client } from '@aws-sdk/client-s3';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getObject, putObject } from './storageService';

/**
 * Builds a fake S3 client whose `send` is a vitest mock.
 * @param impl - Implementation for the mocked `send` call
 * @returns A fake S3 client usable in place of the real one
 */
function fakeClient(impl: (command: unknown) => unknown): S3Client {
  return { send: vi.fn(impl) } as unknown as S3Client;
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv('S3_BUCKET', 'test-bucket');
});

describe('putObject', () => {
  it('sends a PutObjectCommand with the configured bucket, key and value', async () => {
    const client = fakeClient(() => ({}));

    await putObject('greeting', 'hello', client);

    expect(client.send).toHaveBeenCalledTimes(1);
    const command = vi.mocked(client.send).mock.calls[0][0];
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect((command as PutObjectCommand).input).toMatchObject({
      Bucket: 'test-bucket',
      Key: 'greeting',
      Body: 'hello',
    });
  });
});

describe('getObject', () => {
  it('returns the stored value via a GetObjectCommand', async () => {
    const client = fakeClient(() => ({
      Body: { transformToString: async () => 'hello' },
    }));

    const result = await getObject('greeting', client);

    expect(result).toEqual({ key: 'greeting', value: 'hello' });
    const command = vi.mocked(client.send).mock.calls[0][0];
    expect(command).toBeInstanceOf(GetObjectCommand);
    expect((command as GetObjectCommand).input).toMatchObject({
      Bucket: 'test-bucket',
      Key: 'greeting',
    });
  });

  it('returns an empty value when the object body is missing', async () => {
    const client = fakeClient(() => ({}));

    expect(await getObject('greeting', client)).toEqual({
      key: 'greeting',
      value: '',
    });
  });

  it('returns null when the key does not exist (NoSuchKey)', async () => {
    const client = fakeClient(() => {
      throw Object.assign(new Error('missing'), { name: 'NoSuchKey' });
    });

    expect(await getObject('missing', client)).toBeNull();
  });

  it('rethrows unexpected errors', async () => {
    const client = fakeClient(() => {
      throw Object.assign(new Error('boom'), { name: 'AccessDenied' });
    });

    await expect(getObject('greeting', client)).rejects.toThrow('boom');
  });
});
