jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => {},
}), { virtual: true });

import { ExamSchedulingService } from './exam-scheduling.service';
import { BadRequestException } from '@nestjs/common';

describe('ExamSchedulingService', () => {
  let service: ExamSchedulingService;
  let scheduleRepo: any;
  let slotRepo: any;
  let assignmentRepo: any;
  let auditRepo: any;
  let savedGroupRepo: any;
  let assessmentRepo: any;
  let userRepo: any;
  let attemptRepo: any;
  let dataSource: any;

  beforeEach(() => {
    scheduleRepo = {
      create: jest.fn((dto) => ({ id: 'schedule-uuid-1', ...dto })),
      save: jest.fn((entity) => Promise.resolve({ id: 'schedule-uuid-1', ...entity })),
      findOne: jest.fn(),
      find: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: jest.fn(),
    };

    slotRepo = {
      create: jest.fn((dto) => ({ id: 'slot-uuid-1', ...dto })),
      save: jest.fn((entity) => {
        if (Array.isArray(entity)) {
          return Promise.resolve(entity.map((s, idx) => ({ id: `slot-uuid-${idx + 1}`, ...s })));
        }
        return Promise.resolve({ id: 'slot-uuid-1', ...entity });
      }),
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    assignmentRepo = {
      create: jest.fn((dto) => ({ id: 'assign-uuid-1', ...dto })),
      save: jest.fn((entity) => Promise.resolve(entity)),
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: jest.fn(),
    };

    auditRepo = {
      create: jest.fn((dto) => ({ id: 'audit-uuid-1', ...dto })),
      save: jest.fn((entity) => Promise.resolve(entity)),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
    };

    savedGroupRepo = {
      create: jest.fn((dto) => ({ id: 'group-uuid-1', ...dto })),
      save: jest.fn((entity) => Promise.resolve(entity)),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    assessmentRepo = {
      findOne: jest.fn(),
    };

    userRepo = {
      find: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest.fn(),
    };

    attemptRepo = {
      findOne: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    };

    dataSource = {
      transaction: jest.fn(async (callback) => {
        const manager = {
          findOne: jest.fn().mockResolvedValue(null),
          create: jest.fn((_, dto) => ({ id: 'assign-uuid-chunk', ...dto })),
          save: jest.fn((entity) => Promise.resolve(entity)),
          count: jest.fn().mockResolvedValue(10),
        };
        return callback(manager);
      }),
    };

    service = new ExamSchedulingService(
      scheduleRepo,
      slotRepo,
      assignmentRepo,
      auditRepo,
      savedGroupRepo,
      assessmentRepo,
      userRepo,
      attemptRepo,
      dataSource,
    );
  });

  describe('Schedule Lifecycle', () => {
    it('creates a new exam schedule draft', async () => {
      assessmentRepo.findOne.mockResolvedValue({ id: 'assessment-uuid', durationMinutes: 90 });
      scheduleRepo.findOne.mockResolvedValue(null);

      const result = await service.createSchedule(
        {
          assessmentId: 'assessment-uuid',
          title: 'DSA Midterm Fall 2026',
          code: 'SCH-DSA-01',
          academicSession: '2026-2027',
          semester: 5,
        },
        { id: 'admin-id', email: 'admin@cumail.in', role: 'admin' },
      );

      expect(result).toBeDefined();
      expect(result.title).toBe('DSA Midterm Fall 2026');
      expect(result.status).toBe('draft');
      expect(auditRepo.save).toHaveBeenCalled();
    });

    it('rejects schedule creation with duplicate code', async () => {
      assessmentRepo.findOne.mockResolvedValue({ id: 'assessment-uuid' });
      scheduleRepo.findOne.mockResolvedValue({ id: 'existing-schedule' });

      await expect(
        service.createSchedule(
          {
            assessmentId: 'assessment-uuid',
            title: 'DSA Midterm',
            code: 'DUPLICATE-CODE',
          },
          { id: 'admin-id' },
        ),
      ).rejects.toThrow();
    });

    it('publishes schedule when capacity is sufficient', async () => {
      scheduleRepo.findOne.mockResolvedValue({
        id: 'schedule-uuid',
        status: 'draft',
      });
      slotRepo.find.mockResolvedValue([
        { id: 'slot-1', capacity: 300 },
        { id: 'slot-2', capacity: 300 },
      ]);
      assignmentRepo.count.mockResolvedValue(500); // 500 assigned <= 600 capacity

      const published = await service.publishSchedule('schedule-uuid', { id: 'admin-id' });
      expect(published.status).toBe('published');
    });

    it('rejects publication when assigned students exceed slot capacity', async () => {
      scheduleRepo.findOne.mockResolvedValue({ id: 'schedule-uuid', status: 'draft' });
      slotRepo.find.mockResolvedValue([{ id: 'slot-1', capacity: 200 }]);
      assignmentRepo.count.mockResolvedValue(300); // 300 assigned > 200 capacity

      await expect(
        service.publishSchedule('schedule-uuid', { id: 'admin-id' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Slot Management & Auto-Generation', () => {
    it('creates a manual slot with valid start and end times', async () => {
      scheduleRepo.findOne.mockResolvedValue({ id: 'schedule-uuid' });

      const slot = await service.createSlot(
        'schedule-uuid',
        {
          name: 'Morning Slot 1',
          slotCode: 'SLOT-01',
          date: '2026-11-01',
          startTime: '2026-11-01T09:00:00Z',
          endTime: '2026-11-01T10:30:00Z',
          capacity: 300,
        },
        { id: 'admin-id' },
      );

      expect(slot.name).toBe('Morning Slot 1');
      expect(slot.capacity).toBe(300);
    });

    it('rejects slot creation if end time is before start time', async () => {
      scheduleRepo.findOne.mockResolvedValue({ id: 'schedule-uuid' });

      await expect(
        service.createSlot(
          'schedule-uuid',
          {
            name: 'Invalid Slot',
            slotCode: 'SLOT-ERR',
            date: '2026-11-01',
            startTime: '2026-11-01T10:00:00Z',
            endTime: '2026-11-01T09:00:00Z',
            capacity: 300,
          },
          { id: 'admin-id' },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('auto-generates multi-day slots', async () => {
      scheduleRepo.findOne.mockResolvedValue({ id: 'schedule-uuid' });

      const slots = await service.autoGenerateSlots(
        'schedule-uuid',
        {
          startDate: '2026-11-01',
          dailyStartTime: '09:00',
          slotDurationMinutes: 60,
          gapMinutes: 30,
          capacityPerSlot: 300,
          slotsPerDay: 3,
          totalDays: 2,
        },
        { id: 'admin-id' },
      );

      expect(slots.length).toBe(6); // 3 slots * 2 days = 6 slots
    });
  });

  describe('CSV Validation', () => {
    it('identifies duplicate and unknown UIDs', async () => {
      const csvData = Buffer.from('UID,Name\n21BCS101,Alice\n21BCS101,Alice Duplicate\nUNKNOWN999,Ghost');

      const mockQb = {
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          { id: 'user-1', uid: '21BCS101', name: 'Alice', email: 'alice@cuchd.in' },
        ]),
      };
      userRepo.createQueryBuilder.mockReturnValue(mockQb);
      assignmentRepo.find.mockResolvedValue([]);

      const result = await service.validateCsv('schedule-uuid', csvData);

      expect(result.matchedStudents.length).toBe(1);
      expect(result.duplicateUids).toContain('21BCS101');
      expect(result.unknownUids).toContain('UNKNOWN999');
    });
  });

  describe('Allocation & Access Control', () => {
    it('balances eligible students across slots', async () => {
      scheduleRepo.findOne.mockResolvedValue({
        id: 'schedule-uuid',
        config: { earlyAccessMinutes: 5, gracePeriodMinutes: 5 },
      });

      slotRepo.find.mockResolvedValue([
        { id: 'slot-1', capacity: 2, assignedCount: 0, startTime: new Date(), endTime: new Date() },
        { id: 'slot-2', capacity: 2, assignedCount: 0, startTime: new Date(), endTime: new Date() },
      ]);

      assignmentRepo.find.mockResolvedValue([
        { id: 'a1', status: 'eligible' },
        { id: 'a2', status: 'eligible' },
        { id: 'a3', status: 'eligible' },
      ]);

      const result = await service.allocateStudentsToSlots(
        'schedule-uuid',
        { strategy: 'balanced' },
        { id: 'admin-id' },
      );

      expect(result.allocatedCount).toBe(3);
    });

    it('blocks student access when revoked', async () => {
      scheduleRepo.findOne.mockResolvedValue({
        id: 'schedule-uuid',
        assessmentId: 'asm-1',
        status: 'published',
      });

      const mockAssignmentQb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({
          id: 'assign-1',
          status: 'revoked',
          overrideReason: 'Cheating violation',
        }),
      };
      assignmentRepo.createQueryBuilder.mockReturnValue(mockAssignmentQb);

      const verification = await service.verifyStudentAccess('asm-1', { id: 'student-1', uid: 'UID-REVOKED' });

      expect(verification.isAllowed).toBe(false);
      expect(verification.reason).toContain('revoked');
    });

    it('blocks unassigned student when schedule is published', async () => {
      scheduleRepo.findOne.mockResolvedValue({
        id: 'schedule-uuid',
        assessmentId: 'asm-1',
        status: 'published',
      });

      const mockAssignmentQb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      };
      assignmentRepo.createQueryBuilder.mockReturnValue(mockAssignmentQb);

      const verification = await service.verifyStudentAccess('asm-1', { id: 'unassigned-student' });

      expect(verification.isAllowed).toBe(false);
      expect(verification.reason).toContain('not assigned');
    });

    it('allows eligible student within slot window', async () => {
      const now = new Date();
      const startTime = new Date(now.getTime() - 10 * 60_000); // started 10m ago
      const endTime = new Date(now.getTime() + 50 * 60_000);   // ends in 50m

      scheduleRepo.findOne.mockResolvedValue({
        id: 'schedule-uuid',
        assessmentId: 'asm-1',
        status: 'published',
        config: { earlyAccessMinutes: 5, lateStartAllowanceMinutes: 15, gracePeriodMinutes: 5 },
      });

      const mockAssignmentQb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({
          id: 'assign-1',
          status: 'assigned',
          slotId: 'slot-1',
          slot: {
            id: 'slot-1',
            startTime,
            endTime,
          },
        }),
      };
      assignmentRepo.createQueryBuilder.mockReturnValue(mockAssignmentQb);
      attemptRepo.findOne.mockResolvedValue(null);

      const verification = await service.verifyStudentAccess('asm-1', { id: 'eligible-student' });

      expect(verification.isAllowed).toBe(true);
      expect(verification.slot).toBeDefined();
    });
  });

  describe('Smart Bulk Identifier Matching', () => {
    it('matches students by UID and Email from pasted text', async () => {
      const pasted = '21BCS101\nstudent2@cuchd.in\n21BCS103, student3@cuchd.in';

      const mockQb = {
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          { id: 'u1', uid: '21BCS101', name: 'Student One', email: 's1@cuchd.in' },
          { id: 'u2', uid: '21BCS102', name: 'Student Two', email: 'student2@cuchd.in' },
          { id: 'u3', uid: '21BCS103', name: 'Student Three', email: 'student3@cuchd.in' },
        ]),
      };
      userRepo.createQueryBuilder.mockReturnValue(mockQb);
      assignmentRepo.find.mockResolvedValue([]);

      const result = await service.matchIdentifiers('schedule-1', { rawText: pasted });

      expect(result.summary.totalInputRows).toBe(3);
      expect(result.summary.matchedStudentsCount).toBe(3);
      expect(result.summary.unmatchedCount).toBe(0);
      expect(result.summary.conflictCount).toBe(0);
      expect(result.matchedStudents.map((s) => s.uid)).toContain('21BCS101');
    });

    it('detects cross-identifier conflict when UID and Email belong to different students', async () => {
      const conflictingText = '21BCS101, student2@cuchd.in'; // UID belongs to User 1, Email belongs to User 2

      const mockQb = {
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          { id: 'u1', uid: '21BCS101', name: 'Alice', email: 'alice@cuchd.in' },
          { id: 'u2', uid: '21BCS102', name: 'Bob', email: 'student2@cuchd.in' },
        ]),
      };
      userRepo.createQueryBuilder.mockReturnValue(mockQb);
      assignmentRepo.find.mockResolvedValue([]);

      const result = await service.matchIdentifiers('schedule-1', { rawText: conflictingText });

      expect(result.summary.conflictCount).toBe(1);
      expect(result.summary.matchedStudentsCount).toBe(0); // Neither should be automatically selected
      expect(result.conflictingRecords[0].reason).toContain('Alice');
      expect(result.conflictingRecords[0].reason).toContain('Bob');
    });

    it('flags unmatched identifiers and duplicate rows in input', async () => {
      const input = '21BCS101\nUNKNOWN_UID_999\n21BCS101'; // row 1 and 3 are duplicates

      const mockQb = {
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          { id: 'u1', uid: '21BCS101', name: 'Alice', email: 'alice@cuchd.in' },
        ]),
      };
      userRepo.createQueryBuilder.mockReturnValue(mockQb);
      assignmentRepo.find.mockResolvedValue([]);

      const result = await service.matchIdentifiers('schedule-1', { rawText: input });

      expect(result.summary.matchedStudentsCount).toBe(1);
      expect(result.summary.duplicateEntriesCount).toBe(1);
      expect(result.summary.unmatchedCount).toBe(1);
      expect(result.unmatchedRecords[0].inputUid).toBe('UNKNOWN_UID_999');
    });

    it('generates formula-injection-safe CSV error reports', () => {
      const csv = service.generateImportErrorReportCsv({
        unmatchedRecords: [{ rowNumber: 1, inputUid: '=cmd|’ /C calc’!A0', inputEmail: '', reason: 'Dangerous formula' }],
        conflictingRecords: [],
        duplicateRecords: [{ rowNumber: 2, identifier: '+123456789' }],
      });

      expect(csv).toContain('\'=cmd'); // Escaped with leading single quote
      expect(csv).toContain('\'+123456789'); // Escaped with leading single quote
    });
  });

  describe('Student Search & Attendance Metrics', () => {
    it('searches students with criteria and properly handles empty string criteria without crashing', async () => {
      const mockQb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([
          [
            {
              id: 'u1',
              uid: '21BCS101',
              name: 'Alice',
              email: 'alice@cuchd.in',
              studentProfile: { semester: 5, department: 'CSE' },
              isActive: true,
            },
          ],
          1,
        ]),
      };
      userRepo.createQueryBuilder.mockReturnValue(mockQb);

      const res = await service.searchStudents({
        semester: '5' as any,
        department: 'CSE',
        program: '',
        search: 'Alice',
      });

      expect(res.students).toHaveLength(1);
      expect(res.total).toBe(1);
      expect(res.pagination).toBeDefined();
      expect(res.pagination.page).toBe(1);
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('studentProfile'),
        expect.anything(),
      );
    });

    it('returns default empty stats when getAttendanceSummary is called with non-UUID id', async () => {
      const res = await service.getAttendanceSummary('invalid-non-uuid');
      expect(res.stats).toBeDefined();
      expect(res.stats.totalAssigned).toBe(0);
      expect(res.stats.inProgress).toBe(0);
      expect(res.stats.completed).toBe(0);
    });

    it('assigns students using non-UUID string UIDs without type uuid errors', async () => {
      scheduleRepo.findOne.mockResolvedValue({ id: 'schedule-uuid-1', assessmentId: 'assessment-1' });
      assignmentRepo.findOne.mockResolvedValue(null);
      assignmentRepo.create.mockImplementation((d: any) => d);
      assignmentRepo.save.mockImplementation((d: any) => Promise.resolve(d));
      assignmentRepo.count.mockResolvedValue(1);

      const mockQb = {
        where: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          {
            id: '550e8400-e29b-41d4-a716-446655440000',
            uid: '2533821',
            email: 'student@cuchd.in',
            name: 'Bob',
            studentProfile: {},
          },
        ]),
      };
      userRepo.createQueryBuilder.mockReturnValue(mockQb);

      const res = await service.bulkAssignStudents(
        'schedule-uuid-1',
        {
          selectionType: 'manual',
          studentUids: ['2533821'],
        } as any,
        { id: 'admin-1', role: 'admin' },
      );

      expect(res.assignedCount).toBe(1);
      expect(mockQb.where).toHaveBeenCalledWith(
        expect.not.stringContaining('u.id IN'),
        expect.anything(),
      );
    });
  });
});
