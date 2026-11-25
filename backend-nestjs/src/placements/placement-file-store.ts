import { ServiceUnavailableException } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/** Private files: local development directory or the existing production S3 bucket. */
export class PlacementFileStore {
  private client?: S3Client;
  private target(key: string) {
    if (!/^[a-f0-9-]+\.pdf$/.test(key))
      throw new Error('Invalid placement file key');
    const storage =
      process.env.PLACEMENTS_STORAGE ||
      (process.env.NODE_ENV === 'production' ? 's3' : 'local');
    if (!['s3', 'local'].includes(storage))
      throw new ServiceUnavailableException(
        'Placement file storage is not configured.',
      );
    if (storage === 's3') {
      const bucket = process.env.AWS_S3_BUCKET_NAME;
      if (!bucket)
        throw new ServiceUnavailableException(
          'Placement PDF storage requires the configured S3 bucket.',
        );
      this.client ||= new S3Client({
        region: process.env.AWS_REGION || 'us-east-1',
      });
      return {
        kind: 's3' as const,
        bucket,
        key: `placements/${key}`,
        client: this.client,
      };
    }
    const directory = resolve(
      process.env.PLACEMENTS_UPLOAD_DIR ||
        join(process.cwd(), '.placement-files'),
    );
    return { kind: 'local' as const, directory, path: join(directory, key) };
  }
  async write(key: string, content: Buffer) {
    const target = this.target(key);
    if (target.kind === 's3') {
      await target.client.send(
        new PutObjectCommand({
          Bucket: target.bucket,
          Key: target.key,
          Body: content,
          ContentType: 'application/pdf',
          ServerSideEncryption: 'AES256',
        }),
      );
    } else {
      await mkdir(target.directory, { recursive: true, mode: 0o700 });
      await writeFile(target.path, content, { flag: 'wx', mode: 0o600 });
    }
  }
  async read(key: string): Promise<Buffer> {
    const target = this.target(key);
    if (target.kind === 's3') {
      const response = await target.client.send(
        new GetObjectCommand({ Bucket: target.bucket, Key: target.key }),
      );
      if (!response.Body) throw new Error('Placement PDF is missing');
      return Buffer.from(await response.Body.transformToByteArray());
    }
    return readFile(target.path);
  }
  async remove(key: string) {
    const target = this.target(key);
    if (target.kind === 's3')
      await target.client.send(
        new DeleteObjectCommand({ Bucket: target.bucket, Key: target.key }),
      );
    else await unlink(target.path);
  }
}
