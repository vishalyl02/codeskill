const send = jest.fn();
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => ({ send })),
  PutObjectCommand: class {
    constructor(readonly input: unknown) {}
  },
  GetObjectCommand: class {
    constructor(readonly input: unknown) {}
  },
  DeleteObjectCommand: class {
    constructor(readonly input: unknown) {}
  },
}));
import { PlacementFileStore } from './placement-file-store';
import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';

describe('production placement file storage', () => {
  const old = {
    mode: process.env.PLACEMENTS_STORAGE,
    bucket: process.env.AWS_S3_BUCKET_NAME,
    deployedBucket: process.env.S3_BUCKET_NAME,
    node: process.env.NODE_ENV,
  };
  beforeEach(() => {
    send.mockReset();
    process.env.NODE_ENV = 'production';
    delete process.env.PLACEMENTS_STORAGE;
    delete process.env.S3_BUCKET_NAME;
    process.env.AWS_S3_BUCKET_NAME = 'test-placement-bucket';
  });
  afterEach(() => {
    for (const [key, value] of Object.entries({
      PLACEMENTS_STORAGE: old.mode,
      AWS_S3_BUCKET_NAME: old.bucket,
      S3_BUCKET_NAME: old.deployedBucket,
      NODE_ENV: old.node,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  it('writes encrypted PDFs and reads/removes the same private S3 key', async () => {
    const store = new PlacementFileStore();
    const bytes = Buffer.from('%PDF-1.4');
    send
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        Body: { transformToByteArray: () => Promise.resolve(bytes) },
      })
      .mockResolvedValueOnce({});
    await store.write('abc-123.pdf', bytes);
    expect(send).toHaveBeenNthCalledWith(1, expect.any(PutObjectCommand));
    expect(send.mock.calls[0][0]).toHaveProperty(
      'input',
      expect.objectContaining({
        Bucket: 'test-placement-bucket',
        Key: 'placements/abc-123.pdf',
        ServerSideEncryption: 'AES256',
        Body: bytes,
      }),
    );
    expect(await store.read('abc-123.pdf')).toEqual(bytes);
    expect(send).toHaveBeenNthCalledWith(2, expect.any(GetObjectCommand));
    await store.remove('abc-123.pdf');
    expect(send).toHaveBeenNthCalledWith(3, expect.any(DeleteObjectCommand));
  });
  it('uses the bucket variable provided by the production Terraform templates', async () => {
    delete process.env.AWS_S3_BUCKET_NAME;
    process.env.S3_BUCKET_NAME = 'terraform-placement-bucket';
    send.mockResolvedValue({});
    await new PlacementFileStore().write('abc.pdf', Buffer.from('%PDF-1.4'));
    expect(send.mock.calls[0][0]).toHaveProperty(
      'input.Bucket',
      'terraform-placement-bucket',
    );
  });
  it('prefers the explicit AWS bucket setting when both names are supplied', async () => {
    process.env.S3_BUCKET_NAME = 'terraform-placement-bucket';
    send.mockResolvedValue({});
    await new PlacementFileStore().write('abc.pdf', Buffer.from('%PDF-1.4'));
    expect(send.mock.calls[0][0]).toHaveProperty(
      'input.Bucket',
      'test-placement-bucket',
    );
  });
  it('rejects missing production storage and path traversal without AWS calls', async () => {
    const store = new PlacementFileStore();
    delete process.env.AWS_S3_BUCKET_NAME;
    await expect(store.write('abc.pdf', Buffer.from('PDF'))).rejects.toThrow(
      'S3 bucket',
    );
    await expect(store.read('../secret.pdf')).rejects.toThrow(
      'Invalid placement file key',
    );
    expect(send).not.toHaveBeenCalled();
  });
});
