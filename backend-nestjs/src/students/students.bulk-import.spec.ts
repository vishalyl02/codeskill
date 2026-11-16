jest.mock('@nestjs/typeorm', () => ({ InjectRepository: () => () => {} }));
jest.mock('@nestjs/bullmq', () => ({ InjectQueue: () => () => {} }));

import { StudentsService } from './students.service';
import * as xlsx from 'xlsx';

describe('Students Bulk Import & Validation', () => {
  let service: StudentsService;
  let userRepo: any;
  let auditLogRepo: any;
  let emailJobRepo: any;
  let queue: any;

  const admin = { id: 'admin-uuid-1', email: 'admin@codeskill.com' };

  beforeEach(() => {
    jest.clearAllMocks();
    userRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((data: any) => ({ id: 'new-user-id', ...data })),
      save: jest.fn((data: any) => Promise.resolve(data)),
      manager: {
        transaction: jest.fn(async (cb: any) => {
          return cb({
            save: jest.fn((data: any) => Promise.resolve(data)),
          });
        }),
      },
    };
    auditLogRepo = {
      create: jest.fn((data: any) => data),
      save: jest.fn().mockResolvedValue(true),
    };
    emailJobRepo = {
      create: jest.fn((data: any) => ({ id: 'job-id', ...data })),
      save: jest.fn().mockResolvedValue(true),
    };
    queue = {
      add: jest.fn().mockResolvedValue(true),
    };

    service = new StudentsService(
      userRepo as any,
      auditLogRepo as any,
      emailJobRepo as any,
      queue as any,
    );
  });

  const createWorkbookBuffer = (rows: Record<string, any>[]): Buffer => {
    const ws = xlsx.utils.json_to_sheet(rows);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Students');
    return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
  };

  it('validates required fields, formats, and phone numbers', async () => {
    const rows = [
      {
        uid: 'CU101',
        name: 'Alice Smith',
        email: 'alice@example.com',
        batch: '2022-2026',
        year: 2026,
        semester: 6,
        mobile: '+919876543210',
      },
      {
        uid: 'INVALID UID!',
        name: 'Bob Jones',
        email: 'not-an-email',
        batch: '',
        year: 1980, // out of range
        semester: 15, // out of range
        mobile: '12345', // too short
      },
    ];

    const buffer = createWorkbookBuffer(rows);
    const result = await service.parseAndValidateImport(buffer);

    expect(result.total).toBe(2);
    expect(result.valid).toBe(1);
    expect(result.invalid).toBe(1);
    expect(result.errors.length).toBeGreaterThan(0);
    const invalidErr = result.errors.find((e) => e.row === 3);
    expect(invalidErr?.error).toContain('Invalid email format');
    expect(invalidErr?.error).toContain('Batch/class is missing');
    expect(invalidErr?.error).toContain('Invalid mobile number');
  });

  it('detects duplicates within uploaded file and against existing database records', async () => {
    userRepo.find.mockImplementation(({ where }: any) => {
      if (where.uid) {
        return Promise.resolve([{ uid: 'CU_EXISTING', email: 'existing@example.com' }]);
      }
      return Promise.resolve([]);
    });

    const rows = [
      {
        uid: 'CU_EXISTING', // in DB
        name: 'Existing Student',
        email: 'unique1@example.com',
        batch: '2022-2026',
        year: 2026,
        semester: 6,
      },
      {
        uid: 'CU_NEW_1',
        name: 'First New',
        email: 'new1@example.com',
        batch: '2022-2026',
        year: 2026,
        semester: 6,
      },
      {
        uid: 'CU_NEW_1', // duplicate in file!
        name: 'Repeated New',
        email: 'new2@example.com',
        batch: '2022-2026',
        year: 2026,
        semester: 6,
      },
    ];

    const buffer = createWorkbookBuffer(rows);
    const result = await service.parseAndValidateImport(buffer);

    expect(result.duplicates).toBe(2); // 1 DB duplicate, 1 file duplicate
    expect(result.valid).toBe(1);
    expect(result.validRows[0].uid).toBe('CU_NEW_1');
  });

  it('supports assigning default batch, department, course, and semester during import', async () => {
    const rows = [
      {
        uid: 'CU202',
        name: 'Charlie Brown',
        email: 'charlie@example.com',
        // batch and department missing in row
      },
    ];

    const buffer = createWorkbookBuffer(rows);
    const result = await service.parseAndValidateImport(buffer, {
      defaultBatch: 'Batch-2026-A',
      defaultDepartment: 'Computer Science',
      defaultCourse: 'B.Tech CSE',
      defaultSemester: 6,
      defaultYear: 2026,
    });

    expect(result.valid).toBe(1);
    expect(result.validRows[0].batch).toBe('Batch-2026-A');
    expect(result.validRows[0].department).toBe('Computer Science');
    expect(result.validRows[0].course).toBe('B.Tech CSE');
    expect(result.validRows[0].semester).toBe(6);
  });

  it('accepts ordinal semester values from university spreadsheets', async () => {
    const buffer = createWorkbookBuffer([{
      'Roll No': 2416438,
      Name: 'Aadarshdeep Singh',
      'Email Id': '2416438.cse.coe@cgc.edu.in',
      Branch: 'CSE',
      Sem: '5th',
    }]);

    const result = await service.parseAndValidateImport(buffer, {
      defaultBatch: 'AY 2026-2027 ODD',
      defaultYear: 2027,
    });

    expect(result.valid).toBe(1);
    expect(result.validRows[0].semester).toBe(5);
    expect(result.validRows[0].uid).toBe('2416438');
  });

  it('re-uploading the same file performs idempotent processing and does not fail', async () => {
    // Simulate database returning existing records for confirm check
    userRepo.find.mockResolvedValue([
      { uid: 'CU_ALREADY_THERE', email: 'already@example.com' },
    ]);

    const validRows = [
      {
        rowNumber: 2,
        uid: 'CU_ALREADY_THERE',
        email: 'already@example.com',
        name: 'Already Exists',
        batch: '2026',
      },
      {
        rowNumber: 3,
        uid: 'CU_BRAND_NEW',
        email: 'brandnew@example.com',
        name: 'Brand New',
        batch: '2026',
      },
    ];

    const result = await service.confirmImport(validRows, admin);

    expect(result.success).toBe(true);
    expect(result.importedCount).toBe(1);
    expect(result.skippedCount).toBe(1);
    expect(result.skippedDuplicates[0].uid).toBe('CU_ALREADY_THERE');
  });

  it('AUD-012: never uses static fallback "12345678" and generates cryptographically secure temporary passwords in bulk import', async () => {
    const validRows = [
      {
        rowNumber: 2,
        uid: 'STUDENT_NO_PWD',
        email: 'nopwd@example.com',
        name: 'No Password Student',
        batch: '2026',
      },
    ];

    let savedEmailJob: any = null;
    emailJobRepo.create.mockImplementation((data: any) => {
      savedEmailJob = data;
      return { id: 'job-id', ...data };
    });

    const result = await service.confirmImport(validRows, admin);

    expect(result.success).toBe(true);
    expect(savedEmailJob).toBeDefined();
    expect(savedEmailJob.temporaryPassword).not.toBe('12345678');
    expect(savedEmailJob.temporaryPassword.length).toBeGreaterThanOrEqual(12);
  });

  it('AUD-012: generates secure random password on single createStudent when password is omitted', async () => {
    const result = await service.create(
      {
        name: 'Auto Password Student',
        email: 'autopass@example.com',
        uid: 'UID_AUTO_100',
      } as any,
      admin,
    );

    expect(result.generatedPassword).toBeDefined();
    expect(result.generatedPassword).not.toBe('12345678');
    expect(result.generatedPassword.length).toBeGreaterThanOrEqual(12);
  });

  it('resets student password and returns temporaryPassword with bumped tokenVersion', async () => {
    const existingStudent = {
      id: 'student-uuid-1',
      uid: 'UID_RESET_1',
      email: 'reset@example.com',
      name: 'Reset Student',
      password: 'old-hashed-password',
      tokenVersion: 1,
    };
    userRepo.findOne.mockResolvedValue(existingStudent);

    const result = await service.resetPassword('student-uuid-1', admin);
    expect(result.temporaryPassword).toBeDefined();
    expect(result.temporaryPassword.length).toBeGreaterThanOrEqual(10);
    expect(existingStudent.tokenVersion).toBe(2);
    expect(existingStudent.forcePasswordChange).toBe(true);
  });

  it('preserves custom password and allows setting forcePasswordChange on create', async () => {
    const result = await service.create(
      {
        name: 'Custom Pass Student',
        email: 'custompass@example.com',
        uid: 'UID_CUSTOM_100',
        password: 'MyChosenPassword123!',
        forcePasswordChange: false,
      } as any,
      admin,
    );

    expect(result.initialPassword).toBe('MyChosenPassword123!');
    expect(result.generatedPassword).toBeNull();
    expect(userRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        forcePasswordChange: false,
      }),
    );
  });

  it('rejects batch import exceeding 500 rows to prevent threadpool starvation (ISSUE-PRF-002)', async () => {
    const hugeBatch = Array.from({ length: 501 }, (_, i) => ({
      uid: `UID_${i}`,
      name: `Student ${i}`,
      email: `student${i}@test.com`,
    }));

    await expect(service.confirmImport(hugeBatch, admin)).rejects.toThrow(
      'exceeds maximum allowed limit of 500',
    );
  });

  it('sanitizes malicious prototype pollution keys in spreadsheets (ISSUE-SEC-005)', async () => {
    const maliciousRow = {
      uid: 'CU_SEC_1',
      name: 'Security Test',
      email: 'sec@test.com',
      batch: '2022-2026',
      year: 2026,
      semester: 6,
      __proto__: { polluted: true },
      constructor: { prototype: { admin: true } },
    };

    const buffer = createWorkbookBuffer([maliciousRow]);
    const result = await service.parseAndValidateImport(buffer);

    expect(result.valid).toBe(1);
    expect((Object.prototype as any).polluted).toBeUndefined();
    expect((Object.prototype as any).admin).toBeUndefined();
    expect(result.validRows[0].__proto__).not.toEqual({ polluted: true });
  });

  it('rejects disallowed prototype pollution sheet names (AUD-SEC-002)', async () => {
    const buffer = createWorkbookBuffer([{ uid: 'CU_1', name: 'Valid User', email: 'v@test.com' }]);
    await expect(
      service.parseAndValidateImport(buffer, { sheetName: '__proto__' }),
    ).rejects.toThrow('Disallowed worksheet name');
  });
});
