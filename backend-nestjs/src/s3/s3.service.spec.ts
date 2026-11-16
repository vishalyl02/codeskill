import { S3Service } from './s3.service';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://mocked-signed-url.com/proctoring/test.jpg?token=abc'),
}));

describe('S3Service', () => {
  let service: S3Service;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      AWS_REGION: 'us-east-1',
      AWS_S3_BUCKET_NAME: 'test-bucket',
      AWS_ACCESS_KEY_ID: 'test-key',
      AWS_SECRET_ACCESS_KEY: 'test-secret',
    };
    service = new S3Service();
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  describe('getPresignedUrl', () => {
    it('returns signed URL for valid proctoring key', async () => {
      const result = await service.getPresignedUrl('proctoring/attempt-1/capture.jpg');
      expect(result).toBe('https://mocked-signed-url.com/proctoring/test.jpg?token=abc');
      expect(getSignedUrl).toHaveBeenCalledTimes(1);
    });

    it('extracts key from full S3 URL and generates signed URL', async () => {
      const fullUrl = 'https://test-bucket.s3.us-east-1.amazonaws.com/proctoring/attempt-1/capture.jpg';
      const result = await service.getPresignedUrl(fullUrl);
      expect(result).toBe('https://mocked-signed-url.com/proctoring/test.jpg?token=abc');
      expect(getSignedUrl).toHaveBeenCalledTimes(1);
    });

    it('rejects keys with path traversal attempts', async () => {
      const maliciousKey = 'proctoring/../etc/passwd';
      const result = await service.getPresignedUrl(maliciousKey);
      expect(result).toBe(maliciousKey);
      expect(getSignedUrl).not.toHaveBeenCalled();
    });

    it('rejects keys outside allowed prefixes', async () => {
      const unauthorizedKey = 'secret-keys/aws.json';
      const result = await service.getPresignedUrl(unauthorizedKey);
      expect(result).toBe(unauthorizedKey);
      expect(getSignedUrl).not.toHaveBeenCalled();
    });

    it('uses bounded 300-second expiration by default (AUD-SEC-004)', async () => {
      await service.getPresignedUrl('proctoring/attempt-1/capture.jpg');
      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { expiresIn: 300 },
      );
    });

    it('respects S3_PRESIGNED_TTL_SECONDS environment override', async () => {
      process.env.S3_PRESIGNED_TTL_SECONDS = '120';
      const customService = new S3Service();
      expect(customService.getDefaultPresignedTtl()).toBe(120);
      await customService.getPresignedUrl('proctoring/attempt-1/capture.jpg');
      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { expiresIn: 120 },
      );
    });

    it('returns input safely when bucketName is not configured', async () => {
      delete (service as any).bucketName;
      const result = await service.getPresignedUrl('proctoring/capture.jpg');
      expect(result).toBe('proctoring/capture.jpg');
      expect(getSignedUrl).not.toHaveBeenCalled();
    });
  });
});
