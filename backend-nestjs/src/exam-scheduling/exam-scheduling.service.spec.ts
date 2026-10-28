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
          update: jest.fn().mockResolvedValue({ affected: 1 }),
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

    it('generates inclusive 3-day exam slots across 28, 29, and 30 October 2026 without off-by-one errors', async () => {
      scheduleRepo.findOne.mockResolvedValue({ id: 'schedule-uuid' });
      slotRepo.find.mockResolvedValue([]);

      const slots = await service.autoGenerateSlots(
        'schedule-uuid',
        {
          startDate: '2026-10-28',
          endDate: '2026-10-30',
          dailyStartTime: '09:30',
          slotDurationMinutes: 200,
          gapMinutes: 0,
          capacityPerSlot: 150,
          slotsPerDay: 2,
          namePrefix: 'Batch Slot',
        },
        { id: 'admin-id' },
      );

      expect(slots.length).toBe(6); // 2 slots * 3 days = 6 slots
      const dates = slots.map((s) => s.date);
      expect(dates).toEqual([
        '2026-10-28',
        '2026-10-28',
        '2026-10-29',
        '2026-10-29',
        '2026-10-30',
        '2026-10-30',
      ]);
      expect(dates).not.toContain('2026-10-27');
      expect(dates).not.toContain('2026-10-31');
      expect(slots[0].capacity).toBe(150);
      expect(slots[0].slotCode).toBe('SLOT-01');
      expect(slots[5].slotCode).toBe('SLOT-06');
    });

    it('copies a day slot configuration to target dates without duplicating existing slots', async () => {
      scheduleRepo.findOne.mockResolvedValue({ id: 'schedule-uuid' });

      // Mock source slots on 2026-10-28
      const sourceSlots = [
        {
          id: 's-1',
          name: 'Slot 1 (Morning)',
          slotCode: 'SLOT-01',
          date: '2026-10-28',
          startTime: new Date('2026-10-28T04:00:00Z'),
          endTime: new Date('2026-10-28T07:20:00Z'),
          capacity: 250,
          roomOrLab: 'Lab A',
          status: 'scheduled',
        },
        {
          id: 's-2',
          name: 'Slot 2 (Afternoon)',
          slotCode: 'SLOT-02',
          date: '2026-10-28',
          startTime: new Date('2026-10-28T07:20:00Z'),
          endTime: new Date('2026-10-28T10:40:00Z'),
          capacity: 250,
          roomOrLab: 'Lab B',
          status: 'scheduled',
        },
      ];

      // First find call: for sourceDate; second call: all slots for existing check
      slotRepo.find
        .mockResolvedValueOnce(sourceSlots)
        .mockResolvedValueOnce([...sourceSlots]);

      const copied = await service.copyDaySlots(
        'schedule-uuid',
        {
          sourceDate: '2026-10-28',
          targetDates: ['2026-10-29', '2026-10-30'],
        },
        { id: 'admin-id' },
      );

      expect(copied.length).toBe(4); // 2 slots * 2 target days = 4 slots
      const copiedDates = copied.map((s) => s.date);
      expect(copiedDates).toContain('2026-10-29');
      expect(copiedDates).toContain('2026-10-30');
      expect(copiedDates).not.toContain('2026-10-28');
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

    it('calculates allocation preview without committing to DB', async () => {
      scheduleRepo.findOne.mockResolvedValue({
        id: 'schedule-uuid',
        config: { earlyAccessMinutes: 5, gracePeriodMinutes: 5 },
      });

      slotRepo.find.mockResolvedValue([
        { id: 'slot-1', name: 'Slot 1', capacity: 2, assignedCount: 0, startTime: new Date(), endTime: new Date() },
        { id: 'slot-2', name: 'Slot 2', capacity: 2, assignedCount: 0, startTime: new Date(), endTime: new Date() },
      ]);

      assignmentRepo.find.mockResolvedValue([
        { id: 'a1', studentUid: '101', status: 'eligible' },
        { id: 'a2', studentUid: '102', status: 'eligible' },
        { id: 'a3', studentUid: '103', status: 'eligible' },
      ]);

      const result = await service.allocateStudentsToSlots(
        'schedule-uuid',
        { strategy: 'balanced', previewOnly: true },
        { id: 'admin-id' },
      );

      expect(result.preview).toBe(true);
      expect(result.allocatedCount).toBe(3);
      expect(result.slots.length).toBe(2);
      expect(result.unassignedCount).toBe(0);
    });

    it('bulk reassigns students to destination slot and updates counts', async () => {
      scheduleRepo.findOne.mockResolvedValue({
        id: 'schedule-uuid',
        config: { earlyAccessMinutes: 5, gracePeriodMinutes: 5 },
      });

      slotRepo.findOne.mockResolvedValue({
        id: 'dest-slot',
        name: 'Afternoon Slot',
        capacity: 100,
        assignedCount: 10,
        startTime: new Date(),
        endTime: new Date(),
      });

      assignmentRepo.find.mockResolvedValue([
        { id: 'a1', studentId: 's1', studentUid: 'U1', slotId: 'old-slot', status: 'assigned' },
        { id: 'a2', studentId: 's2', studentUid: 'U2', slotId: 'old-slot', status: 'assigned' },
      ]);

      assignmentRepo.count.mockResolvedValue(12);

      const result = await service.bulkReassignSlot(
        'schedule-uuid',
        {
          assignmentIds: ['a1', 'a2'],
          targetSlotId: 'dest-slot',
          reason: 'Emergency reschedule',
        },
        { id: 'admin-id', email: 'admin@test.com', role: 'admin' },
      );

      expect(result.reassignedCount).toBe(2);
      expect(result.skippedCount).toBe(0);
      expect(result.targetSlot.id).toBe('dest-slot');
    });

    it('rejects bulk reassign when destination slot capacity is exceeded', async () => {
      scheduleRepo.findOne.mockResolvedValue({ id: 'schedule-uuid' });

      slotRepo.findOne.mockResolvedValue({
        id: 'dest-slot',
        name: 'Full Slot',
        capacity: 2,
        assignedCount: 2,
        startTime: new Date(),
        endTime: new Date(),
      });

      assignmentRepo.find.mockResolvedValue([
        { id: 'a1', studentId: 's1', studentUid: 'U1', slotId: 'other-slot', status: 'assigned' },
      ]);

      assignmentRepo.count.mockResolvedValue(2); // remaining capacity is 0

      await expect(
        service.bulkReassignSlot(
          'schedule-uuid',
          {
            assignmentIds: ['a1'],
            targetSlotId: 'dest-slot',
          },
          { id: 'admin-id' },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('bulk revokes access and refreshes affected slot capacity', async () => {
      assignmentRepo.find.mockResolvedValue([
        { id: 'a1', studentId: 's1', studentUid: 'U1', slotId: 'slot-1', status: 'assigned' },
        { id: 'a2', studentId: 's2', studentUid: 'U2', slotId: 'slot-1', status: 'assigned' },
      ]);
      assignmentRepo.count.mockResolvedValue(0);

      const result = await service.revokeAccess(
        'schedule-uuid',
        {
          assignmentIds: ['a1', 'a2'],
          reason: 'Academic violation',
        },
        { id: 'admin-id', email: 'admin@test.com', role: 'admin' },
      );

      expect(result.revokedCount).toBe(2);
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

    it('allocates large student population of 3,000 students evenly across 6 multi-day slots', async () => {
      scheduleRepo.findOne.mockResolvedValue({
        id: '00000000-0000-0000-0000-000000000001',
        config: { earlyAccessMinutes: 5, gracePeriodMinutes: 5 },
      });

      // 6 slots (2 slots/day across 3 days) each with capacity 500 (total capacity: 3,000)
      const slots = [
        { id: 'slot-1', date: '2026-10-28', capacity: 500, assignedCount: 0, startTime: new Date(), endTime: new Date() },
        { id: 'slot-2', date: '2026-10-28', capacity: 500, assignedCount: 0, startTime: new Date(), endTime: new Date() },
        { id: 'slot-3', date: '2026-10-29', capacity: 500, assignedCount: 0, startTime: new Date(), endTime: new Date() },
        { id: 'slot-4', date: '2026-10-29', capacity: 500, assignedCount: 0, startTime: new Date(), endTime: new Date() },
        { id: 'slot-5', date: '2026-10-30', capacity: 500, assignedCount: 0, startTime: new Date(), endTime: new Date() },
        { id: 'slot-6', date: '2026-10-30', capacity: 500, assignedCount: 0, startTime: new Date(), endTime: new Date() },
      ];
      slotRepo.find.mockResolvedValue(slots);

      // Generate 3,000 eligible students
      const eligibleStudents = Array.from({ length: 3000 }, (_, i) => ({
        id: `assign-${i + 1}`,
        studentUid: `UID-${String(i + 1).padStart(5, '0')}`,
        status: 'eligible',
      }));
      assignmentRepo.find.mockResolvedValue(eligibleStudents);

      const result = await service.allocateStudentsToSlots(
        '00000000-0000-0000-0000-000000000001',
        { strategy: 'balanced', previewOnly: true },
        { id: 'admin-id' },
      );

      expect(result.allocatedCount).toBe(3000);
      expect(result.slots.length).toBe(6);
      for (const slotSummary of result.slots) {
        expect(slotSummary.proposedCount).toBe(500);
      }
    });

    it('calculates multi-day perDayOccupancy and flexible access counts in findScheduleById', async () => {
      const scheduleUuid = '00000000-0000-0000-0000-000000000001';
      scheduleRepo.findOne.mockResolvedValue({
        id: scheduleUuid,
        title: '3-Day Comprehensive Assessment',
        totalEligibleStudents: 900,
        config: {
          scheduleMode: 'flexible',
          isFlexibleAvailability: true,
          startDate: '2026-10-28',
          endDate: '2026-10-30',
        },
      });

      const slots = [
        { id: 's1', date: '2026-10-28', capacity: 150, assignedCount: 150 },
        { id: 's2', date: '2026-10-28', capacity: 150, assignedCount: 150 },
        { id: 's3', date: '2026-10-29', capacity: 150, assignedCount: 150 },
        { id: 's4', date: '2026-10-29', capacity: 150, assignedCount: 150 },
        { id: 's5', date: '2026-10-30', capacity: 150, assignedCount: 150 },
        { id: 's6', date: '2026-10-30', capacity: 150, assignedCount: 150 },
      ];
      slotRepo.find.mockResolvedValue(slots);

      const mockQb = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { slotId: 's1', count: '150' },
          { slotId: 's2', count: '150' },
          { slotId: 's3', count: '150' },
          { slotId: 's4', count: '150' },
          { slotId: 's5', count: '150' },
          { slotId: 's6', count: '150' },
        ]),
      };
      assignmentRepo.createQueryBuilder.mockReturnValue(mockQb);

      assignmentRepo.count
        .mockResolvedValueOnce(900) // totalAssignedStudents
        .mockResolvedValueOnce(900) // assignedWithSlotCount
        .mockResolvedValueOnce(0);  // flexibleAccessCount

      const scheduleWithDetails = await service.findScheduleById(scheduleUuid);

      expect(scheduleWithDetails.slotsCount).toBe(6);
      expect(scheduleWithDetails.totalSlotCapacity).toBe(900);
      expect(scheduleWithDetails.totalAssignedStudents).toBe(900);
      expect(scheduleWithDetails.unallocatedStudents).toBe(0);

      // Verify perDayOccupancy
      expect(scheduleWithDetails.perDayOccupancy).toBeDefined();
      expect(scheduleWithDetails.perDayOccupancy['2026-10-28']).toEqual({
        date: '2026-10-28',
        slotsCount: 2,
        totalCapacity: 300,
        assignedCount: 300,
      });
      expect(scheduleWithDetails.perDayOccupancy['2026-10-29']).toEqual({
        date: '2026-10-29',
        slotsCount: 2,
        totalCapacity: 300,
        assignedCount: 300,
      });
      expect(scheduleWithDetails.perDayOccupancy['2026-10-30']).toEqual({
        date: '2026-10-30',
        slotsCount: 2,
        totalCapacity: 300,
        assignedCount: 300,
      });
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
