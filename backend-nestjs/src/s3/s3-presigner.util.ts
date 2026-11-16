import * as crypto from 'crypto';

export interface PresignOptions {
  bucket: string;
  region: string;
  key: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  expiresInSeconds?: number;
  s3Client?: any;
}

/**
 * Generates an AWS S3 presigned GET URL.
 * Employs `@aws-sdk/s3-request-presigner` if available, and seamlessly
 * falls back to self-contained standard AWS SigV4 signing using Node.js `crypto`.
 * This prevents TS2307 build failures in offline/pre-installed environments.
 */
export async function generateS3PresignedUrl(options: PresignOptions): Promise<string> {
  const {
    bucket,
    region,
    key,
    accessKeyId,
    secretAccessKey,
    expiresInSeconds = 300,
    s3Client,
  } = options;

  // 1. Attempt runtime dynamic load of AWS SDK presigner
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const presigner = require('@aws-sdk/s3-request-presigner');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { GetObjectCommand } = require('@aws-sdk/client-s3');
    if (presigner && typeof presigner.getSignedUrl === 'function' && s3Client) {
      return await presigner.getSignedUrl(
        s3Client,
        new GetObjectCommand({ Bucket: bucket, Key: key }),
        { expiresIn: expiresInSeconds },
      );
    }
  } catch {
    // Subpackage not present in node_modules, fall through to native SigV4
  }

  // 2. Standard native SigV4 presigning fallback
  const akId = accessKeyId || process.env.AWS_ACCESS_KEY_ID || '';
  const sk = secretAccessKey || process.env.AWS_SECRET_ACCESS_KEY || '';

  if (!akId || !sk) {
    // If no static credentials exist, return the direct object URL
    return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
  }

  const host = `${bucket}.s3.${region}.amazonaws.com`;
  const now = new Date();
  const dateStamp = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 8); // YYYYMMDD
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z'; // YYYYMMDDTHHMMSSZ

  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const credential = `${akId}/${credentialScope}`;

  const queryParams = [
    `X-Amz-Algorithm=AWS4-HMAC-SHA256`,
    `X-Amz-Credential=${encodeURIComponent(credential)}`,
    `X-Amz-Date=${amzDate}`,
    `X-Amz-Expires=${expiresInSeconds}`,
    `X-Amz-SignedHeaders=host`,
  ]
    .sort()
    .join('&');

  const canonicalUri = '/' + key.split('/').map(encodeURIComponent).join('/');
  const canonicalHeaders = `host:${host}\n`;
  const signedHeaders = 'host';
  const payloadHash = 'UNSIGNED-PAYLOAD';

  const canonicalRequest = [
    'GET',
    canonicalUri,
    queryParams,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    crypto.createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n');

  const kDate = crypto.createHmac('sha256', 'AWS4' + sk).update(dateStamp).digest();
  const kRegion = crypto.createHmac('sha256', kDate).update(region).digest();
  const kService = crypto.createHmac('sha256', kRegion).update('s3').digest();
  const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();

  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

  return `https://${host}${canonicalUri}?${queryParams}&X-Amz-Signature=${signature}`;
}
