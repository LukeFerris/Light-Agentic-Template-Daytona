import {
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { getBucketName, getS3Client } from './aws/s3Client';

/**
 * A value stored in object storage, identified by its key.
 */
export interface StoredObject {
  key: string;
  value: string;
}

/**
 * Stores a string value in object storage under the given key.
 *
 * This runs unchanged against the mock container and real AWS S3; only the
 * client configuration differs (see {@link getS3Client}).
 *
 * @param key - Object key to store the value under
 * @param value - String value to store
 * @param client - S3 client to use (defaults to the shared, env-configured client)
 * @returns A promise that resolves once the object has been written
 */
export async function putObject(
  key: string,
  value: string,
  client: S3Client = getS3Client(),
): Promise<void> {
  await client.send(
    new PutObjectCommand({
      Bucket: getBucketName(),
      Key: key,
      Body: value,
      ContentType: 'text/plain; charset=utf-8',
    }),
  );
}

/**
 * Retrieves a previously stored value by key.
 * @param key - Object key to look up
 * @param client - S3 client to use (defaults to the shared, env-configured client)
 * @returns The stored object, or `null` when no object exists for the key
 */
export async function getObject(
  key: string,
  client: S3Client = getS3Client(),
): Promise<StoredObject | null> {
  try {
    const result = await client.send(
      new GetObjectCommand({ Bucket: getBucketName(), Key: key }),
    );
    const value = (await result.Body?.transformToString()) ?? '';
    return { key, value };
  } catch (err) {
    if (
      err instanceof NoSuchKey ||
      (err as { name?: string }).name === 'NoSuchKey'
    ) {
      return null;
    }
    throw err;
  }
}
