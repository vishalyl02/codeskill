jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));

import { CertificationService } from './services/certification.service';

describe('CertificationService', () => {
  let service: CertificationService;

  const mockCertRepo = {
    findOne: jest.fn(),
    create: jest.fn((dto) => ({ id: 'cert-uuid-1', ...dto })),
    save: jest.fn((c) => Promise.resolve(c)),
  };

  const mockEventRepo = {
    create: jest.fn((e) => e),
    save: jest.fn(),
  };

  const mockTemplateRepo = {
    findOne: jest.fn().mockResolvedValue({ id: 'tmpl-uuid-1' }),
  };

  const mockPathRepo = {
    findOne: jest.fn().mockResolvedValue({
      id: 'path-uuid-1',
      title: 'JavaScript Mastery',
      tags: ['JS'],
      estimatedHours: 12,
    }),
  };

  const mockPathProgressRepo = {
    findOne: jest.fn().mockResolvedValue({
      studentId: 'student-uuid-1',
      pathId: 'path-uuid-1',
      percentage: 100,
      status: 'completed',
    }),
    save: jest.fn(),
  };

  const mockUserRepo = {
    findOne: jest.fn().mockResolvedValue({
      id: 'student-uuid-1',
      name: 'Test Student',
      username: 'teststudent',
    }),
  };

  const mockS3Service = {
    uploadFile: jest.fn(),
  };

  beforeEach(() => {
    service = new CertificationService(
      mockCertRepo as any,
      mockEventRepo as any,
      mockTemplateRepo as any,
      mockPathRepo as any,
      mockPathProgressRepo as any,
      mockUserRepo as any,
      mockS3Service as any,
    );
  });

  it('should verify a valid credential publicly without leaking private information', async () => {
    mockCertRepo.findOne.mockResolvedValue({
      id: 'cert-uuid-1',
      credentialId: 'CS-2026-X89K2A',
      recipientName: 'Test Student',
      pathTitle: 'JavaScript Mastery',
      status: 'valid',
      issueDate: new Date('2026-10-21'),
      metadata: { skills: ['JS', 'ES6'], totalHours: 12 },
    });

    const result = await service.verifyCredential('CS-2026-X89K2A');
    expect(result.valid).toBe(true);
    expect(result.credentialId).toBe('CS-2026-X89K2A');
    expect(result.recipientName).toBe('Test Student');
    expect(result.learningPath).toBe('JavaScript Mastery');
    expect((result as any).studentId).toBeUndefined();
    expect((result as any).email).toBeUndefined();
  });

  it('should return valid=false for non-existent credential', async () => {
    mockCertRepo.findOne.mockResolvedValue(null);

    const result = await service.verifyCredential('INVALID-ID');
    expect(result.valid).toBe(false);
  });

  it('should issue certificate atomically when student is 100% completed', async () => {
    mockCertRepo.findOne.mockResolvedValue(null);

    const cert = await service.issueCertificate('path-uuid-1', 'student-uuid-1');
    expect(cert).toBeDefined();
    expect(cert.recipientName).toBe('Test Student');
    expect(cert.credentialId).toMatch(/^CS-\d{4}-[A-Z0-9]{6}$/);
    expect(mockCertRepo.save).toHaveBeenCalled();
  });
});
