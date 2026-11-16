/// <reference types="multer" />
import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { generateS3PresignedUrl } from './s3-presigner.util';
import { randomUUID } from 'node:crypto';
import * as path from 'path';

@Injectable()
export class S3Service {
  private s3Client: S3Client;
  private readonly logger = new Logger(S3Service.name);
  private bucketName: string;

  constructor() {
    const region = process.env.AWS_REGION || 'us-east-1';
    this.bucketName = process.env.AWS_S3_BUCKET_NAME || '';

    // If keys are provided, configure S3 Client.
    // On AWS EC2 with an IAM role attached, credentials might be auto-loaded,
    // but typically we pass them via env for simplicity.
    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
      this.s3Client = new S3Client({
        region,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
      });
    } else {
      // Fallback for EC2 IAM Profile
      this.s3Client = new S3Client({ region });
    }
  }

  async uploadFile(
    file: Express.Multer.File,
    folder: string = 'avatars',
  ): Promise<string> {
    if (!this.bucketName) {
      this.logger.error('AWS_S3_BUCKET_NAME is not configured in .env');
      throw new InternalServerErrorException('S3 Bucket is not configured');
    }

    try {
      const ext = path.extname(file.originalname);
      const filename = `${folder}/${randomUUID()}${ext}`;

      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: filename,
        Body: file.buffer,
        ContentType: file.mimetype,
        // ACL: 'public-read' // Only if bucket allows ACLs, otherwise use Bucket Policy
      });

      await this.s3Client.send(command);

      // Return the public URL
      return `https://${this.bucketName}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${filename}`;
    } catch (error) {
      this.logger.error('Error uploading file to S3', error);
      throw new InternalServerErrorException('Failed to upload file to S3');
    }
  }

  async uploadBase64Image(dataUrl: string, folder = 'proctoring', label = 'capture'): Promise<string> {
    if (!this.bucketName) {
      throw new InternalServerErrorException('S3 Bucket is not configured');
    }
    const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
    if (!match) throw new InternalServerErrorException('Invalid image capture format');
    const contentType = `image/${match[1]}`;
    const body = Buffer.from(match[2], 'base64');
    if (!body.length || body.length > 2 * 1024 * 1024) {
      throw new InternalServerErrorException('Image capture exceeds the allowed size');
    }

    const safeFolder = folder.replace(/[^a-zA-Z0-9/_-]/g, '').replace(/^\/+|\/+$/g, '') || 'proctoring';
    const safeLabel = label.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || 'capture';
    const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
    const key = `${safeFolder}/${safeLabel}-${randomUUID()}.${ext}`;
    try {
      await this.s3Client.send(new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: body,
        ContentType: contentType,
        ServerSideEncryption: 'AES256',
      }));

      // Return presigned URL when configured, or S3 direct URL fallback (AUD-SEC-004: bounded TTL)
      try {
        const presigned = await this.getPresignedUrl(key, this.getDefaultPresignedTtl());
        if (presigned) return presigned;
      } catch (err) {
        this.logger.debug?.('Falling back to direct S3 URL', err);
      }

      return `https://${this.bucketName}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${key}`;
    } catch (error) {
      this.logger.error('Error uploading proctoring capture to S3', error);
      throw new InternalServerErrorException('Failed to upload proctoring capture to S3');
    }
  }

  getDefaultPresignedTtl(): number {
    const configured = parseInt(process.env.S3_PRESIGNED_TTL_SECONDS || '', 10);
    return Number.isFinite(configured) && configured > 0 ? configured : 300;
  }

  async getPresignedUrl(
    keyOrUrl: string,
    expiresInSeconds: number = this.getDefaultPresignedTtl(),
    allowedPrefixes: string[] = ['proctoring/', 'submissions/', 'avatars/'],
  ): Promise<string> {
    if (!this.bucketName || !keyOrUrl || typeof keyOrUrl !== 'string') {
      return keyOrUrl;
    }

    try {
      let key = keyOrUrl;
      if (keyOrUrl.startsWith('http://') || keyOrUrl.startsWith('https://')) {
        const parsed = new URL(keyOrUrl);
        key = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
      }

      // Ensure key starts with one of the allowed prefixes and has no path traversal
      const isAllowed = allowedPrefixes.some((prefix) => key.startsWith(prefix));
      if (!isAllowed || key.includes('..')) {
        this.logger.warn(`Rejected presigned URL generation for invalid key: ${key}`);
        return keyOrUrl;
      }

      return await generateS3PresignedUrl({
        bucket: this.bucketName,
        region: process.env.AWS_REGION || 'us-east-1',
        key,
        s3Client: this.s3Client,
        expiresInSeconds,
      });
    } catch (error) {
      this.logger.error(`Error generating presigned URL for key/url: ${keyOrUrl}`, error);
      return keyOrUrl;
    }
  }

  async deleteFile(fileUrl: string, allowedPrefix: string = 'avatars/'): Promise<void> {
    if (!this.bucketName || !fileUrl || typeof fileUrl !== 'string') {
      return;
    }

    try {
      const url = new URL(fileUrl);
      const key = decodeURIComponent(url.pathname.replace(/^\/+/, ''));

      // Strict validation: must start with the allowed prefix, cannot traverse paths,
      // and must match this bucket's domain.
      if (!key || !key.startsWith(allowedPrefix) || key.includes('..')) {
        this.logger.warn(`Rejected S3 delete for disallowed key: ${key}`);
        return;
      }

      if (!url.hostname.startsWith(`${this.bucketName}.s3.`)) {
        this.logger.warn(`Rejected S3 delete for foreign host: ${url.hostname}`);
        return;
      }

      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await this.s3Client.send(command);
      this.logger.log(`Successfully deleted old file from S3: ${key}`);
    } catch (error) {
      this.logger.error(`Error deleting file from S3: ${fileUrl}`, error);
    }
  }
}
