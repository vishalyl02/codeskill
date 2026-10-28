import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In, Like, Raw } from 'typeorm';
import {
  ExamSchedule,
  ExamScheduleConfig,
} from '../database/entities/exam-schedule.entity';
import { ExamSlot } from '../database/entities/exam-slot.entity';
import {
  ExamEligibilityAssignment,
  EligibilityAssignmentStatus,
} from '../database/entities/exam-eligibility-assignment.entity';
import { ExamAccessAuditLog } from '../database/entities/exam-access-audit-log.entity';
import { ExamSavedGroup } from '../database/entities/exam-saved-group.entity';
import { Assessment } from '../database/entities/assessment.entity';
import { User } from '../database/entities/user.entity';
import { AssessmentAttempt } from '../database/entities/assessment-attempt.entity';
import { CreateExamScheduleDto } from './dto/create-exam-schedule.dto';
import { UpdateExamScheduleDto } from './dto/update-exam-schedule.dto';
import { CreateExamSlotDto } from './dto/create-exam-slot.dto';
import { AutoGenerateSlotsDto } from './dto/auto-generate-slots.dto';
import {
  AllocateStudentsDto,
  ReassignStudentSlotDto,
  BatchReassignSlotDto,
} from './dto/allocate-students.dto';
import {
  BulkAssignStudentsDto,
  StudentFilterCriteriaDto,
  CsvValidationResultDto,
} from './dto/bulk-assign-students.dto';
import {
  RevokeStudentAccessDto,
  GrantExceptionAccessDto,
  ReinstateStudentAccessDto,
} from './dto/access-override.dto';
import { QueryExamSchedulesDto } from './dto/query-exam-schedules.dto';
import { QueryStudentAssignmentsDto } from './dto/query-student-assignments.dto';
import { CreateSavedGroupDto } from './dto/create-saved-group.dto';
import {
  MatchIdentifiersDto,
  IdentifierMatchResultDto,
  IdentifierMatchSummaryDto,
  MatchedStudentDto,
  UnmatchedRecordDto,
  ConflictingRecordDto,
  DuplicateRecordDto,
} from './dto/match-identifiers.dto';
import * as xlsx from 'xlsx';

@Injectable()
export class ExamSchedulingService {
  private readonly logger = new Logger(ExamSchedulingService.name);

  constructor(
    @InjectRepository(ExamSchedule)
    private readonly scheduleRepo: Repository<ExamSchedule>,
    @InjectRepository(ExamSlot)
    private readonly slotRepo: Repository<ExamSlot>,
    @InjectRepository(ExamEligibilityAssignment)
    private readonly assignmentRepo: Repository<ExamEligibilityAssignment>,
    @InjectRepository(ExamAccessAuditLog)
    private readonly auditRepo: Repository<ExamAccessAuditLog>,
    @InjectRepository(ExamSavedGroup)
    private readonly savedGroupRepo: Repository<ExamSavedGroup>,
    @InjectRepository(Assessment)
    private readonly assessmentRepo: Repository<Assessment>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(AssessmentAttempt)
    private readonly attemptRepo: Repository<AssessmentAttempt>,
    private readonly dataSource: DataSource,
  ) {}

  // =========================================================================
  // 1. SCHEDULE LIFECYCLE
  // =========================================================================

  async createSchedule(
    dto: CreateExamScheduleDto,
    user: any,
    ipAddress?: string,
  ): Promise<ExamSchedule> {
    const assessment = await this.assessmentRepo.findOne({
      where: [{ id: dto.assessmentId }, { mongoId: dto.assessmentId }],
    });
    if (!assessment) {
      throw new NotFoundException(`Assessment with ID "${dto.assessmentId}" not found`);
    }

    const existingCode = await this.scheduleRepo.findOne({
      where: { code: dto.code.trim().toUpperCase() },
    });
    if (existingCode) {
      throw new ConflictException(`Schedule code "${dto.code}" is already in use`);
    }

    const semNum =
      dto.semester !== undefined
        ? (typeof dto.semester === 'number' ? dto.semester : parseInt(String(dto.semester).replace(/\D/g, ''), 10))
        : 5;
    const validSemester = isNaN(semNum) || semNum <= 0 ? 5 : semNum;

    const yearNum =
      dto.academicYear !== undefined
        ? (typeof dto.academicYear === 'number' ? dto.academicYear : parseInt(String(dto.academicYear).replace(/\D/g, ''), 10))
        : Math.ceil(validSemester / 2);
    const validAcademicYear = isNaN(yearNum) || yearNum <= 0 ? 3 : yearNum;

    const schedule = this.scheduleRepo.create({
      assessmentId: assessment.id,
      title: dto.title.trim(),
      code: dto.code.trim().toUpperCase(),
      description: dto.description || '',
      academicSession: dto.academicSession || '2025-2026',
      semester: validSemester,
      program: dto.program || 'B.E. Computer Science & Engineering',
      academicYear: validAcademicYear,
      status: 'draft',
      timezone: dto.timezone || 'Asia/Kolkata',
      maxConcurrentSessions: dto.maxConcurrentSessions ?? 500,
      config: {
        earlyAccessMinutes: dto.config?.earlyAccessMinutes ?? 5,
        lateStartAllowanceMinutes: dto.config?.lateStartAllowanceMinutes ?? 15,
        gracePeriodMinutes: dto.config?.gracePeriodMinutes ?? 5,
        maxDurationMinutes: dto.config?.maxDurationMinutes ?? assessment.durationMinutes ?? 60,
        allowedAttempts: dto.config?.allowedAttempts ?? assessment.allowedAttempts ?? 1,
        allowResume: dto.config?.allowResume ?? true,
        allowDisconnectionReentry: dto.config?.allowDisconnectionReentry ?? true,
        strictTimeBoundary: dto.config?.strictTimeBoundary ?? true,
      },
      createdById: user?.id,
    });

    const saved = await this.scheduleRepo.save(schedule);

    await this.logAudit({
      scheduleId: saved.id,
      actorId: user?.id,
      actorEmail: user?.email || 'admin@codeskill.ac.in',
      actorRole: user?.role || 'admin',
      action: 'SCHEDULE_CREATED',
      reason: 'Schedule initialized as draft',
      newState: saved,
      ipAddress,
    });

    return saved;
  }

  async findAllSchedules(
    query: QueryExamSchedulesDto,
  ): Promise<{ schedules: any[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const qb = this.scheduleRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.assessment', 'a')
      .leftJoinAndSelect('s.createdBy', 'u');

    if (query.search) {
      qb.andWhere(
        '(LOWER(s.title) LIKE :search OR LOWER(s.code) LIKE :search OR LOWER(a.title) LIKE :search)',
        { search: `%${query.search.toLowerCase()}%` },
      );
    }

    if (query.status) {
      qb.andWhere('s.status = :status', { status: query.status });
    }

    if (query.assessmentId) {
      qb.andWhere('s.assessmentId = :assessmentId', { assessmentId: query.assessmentId });
    }

    if (query.academicSession) {
      qb.andWhere('s.academicSession = :academicSession', { academicSession: query.academicSession });
    }

    if (query.semester) {
      qb.andWhere('s.semester = :semester', { semester: query.semester });
    }

    qb.orderBy('s.createdAt', 'DESC').skip(skip).take(limit);

    const [schedules, total] = await qb.getManyAndCount();

    // Fetch slot counts and assignment metrics in parallel
    const enhanced = await Promise.all(
      schedules.map(async (s) => {
        const slots = await this.slotRepo.find({ where: { scheduleId: s.id } });
        const totalSlotCapacity = slots.reduce((acc, slot) => acc + (slot.capacity || 0), 0);
        return {
          ...s,
          slotsCount: slots.length,
          totalSlotCapacity,
        };
      }),
    );

    return { schedules: enhanced, total, page, limit };
  }

  async findScheduleById(id: string): Promise<any> {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!id || !uuidRegex.test(id)) {
      throw new NotFoundException(`Exam schedule with ID "${id}" not found`);
    }

    const schedule = await this.scheduleRepo.findOne({
      where: { id },
      relations: { assessment: true, createdBy: true },
    });
    if (!schedule) {
      throw new NotFoundException(`Exam schedule with ID "${id}" not found`);
    }

    const slots = await this.slotRepo.find({
      where: { scheduleId: id },
      order: { startTime: 'ASC' },
    });

    const totalSlotCapacity = slots.reduce((acc, s) => acc + (s.capacity || 0), 0);

    return {
      ...schedule,
      slots,
      slotsCount: slots.length,
      totalSlotCapacity,
    };
  }

  async updateSchedule(
    id: string,
    dto: UpdateExamScheduleDto,
    user: any,
  ): Promise<ExamSchedule> {
    const schedule = await this.scheduleRepo.findOne({ where: { id } });
    if (!schedule) {
      throw new NotFoundException(`Exam schedule with ID "${id}" not found`);
    }

    const previousState = { ...schedule };

    if (dto.title) schedule.title = dto.title.trim();
    if (dto.code) schedule.code = dto.code.trim().toUpperCase();
    if (dto.description !== undefined) schedule.description = dto.description;
    if (dto.academicSession) schedule.academicSession = dto.academicSession;
    if (dto.semester !== undefined) {
      const s = typeof dto.semester === 'number' ? dto.semester : parseInt(String(dto.semester).replace(/\D/g, ''), 10);
      if (!isNaN(s) && s > 0) schedule.semester = s;
    }
    if (dto.program) schedule.program = dto.program;
    if (dto.academicYear !== undefined) {
      const y = typeof dto.academicYear === 'number' ? dto.academicYear : parseInt(String(dto.academicYear).replace(/\D/g, ''), 10);
      if (!isNaN(y) && y > 0) schedule.academicYear = y;
    }
    if (dto.timezone) schedule.timezone = dto.timezone;
    if (dto.maxConcurrentSessions !== undefined) schedule.maxConcurrentSessions = dto.maxConcurrentSessions;
    if (dto.status) schedule.status = dto.status;

    if (dto.config) {
      schedule.config = {
        ...schedule.config,
        ...dto.config,
      };
    }

    const updated = await this.scheduleRepo.save(schedule);

    await this.logAudit({
      scheduleId: id,
      actorId: user?.id,
      actorEmail: user?.email || 'admin@codeskill.ac.in',
      actorRole: user?.role || 'admin',
      action: 'SCHEDULE_UPDATED',
      reason: 'Administrative schedule update',
      previousState,
      newState: updated,
    });

    return updated;
  }

  async publishSchedule(id: string, user: any): Promise<ExamSchedule> {
    const schedule = await this.scheduleRepo.findOne({ where: { id } });
    if (!schedule) {
      throw new NotFoundException(`Exam schedule with ID "${id}" not found`);
    }

    const slots = await this.slotRepo.find({ where: { scheduleId: id } });
    if (slots.length === 0) {
      throw new BadRequestException('Cannot publish schedule without at least one exam slot.');
    }

    const totalCapacity = slots.reduce((acc, s) => acc + (s.capacity || 0), 0);
    const assignedCount = await this.assignmentRepo.count({
      where: { scheduleId: id, status: In(['assigned', 'eligible', 'in_progress', 'completed']) },
    });

    if (assignedCount > totalCapacity) {
      throw new BadRequestException(
        `Total assigned students (${assignedCount}) exceeds total slot capacity (${totalCapacity}). Adjust slot capacities or rebalance before publishing.`,
      );
    }

    schedule.status = 'published';
    const updated = await this.scheduleRepo.save(schedule);

    await this.logAudit({
      scheduleId: id,
      actorId: user?.id,
      actorEmail: user?.email || 'admin@codeskill.ac.in',
      actorRole: user?.role || 'admin',
      action: 'SCHEDULE_PUBLISHED',
      reason: 'Schedule verified and published to active examination ledger',
      newState: { status: 'published', totalCapacity, assignedCount },
    });

    return updated;
  }

  async cancelSchedule(id: string, reason: string, user: any): Promise<ExamSchedule> {
    const schedule = await this.scheduleRepo.findOne({ where: { id } });
    if (!schedule) {
      throw new NotFoundException(`Exam schedule with ID "${id}" not found`);
    }

    const previousStatus = schedule.status;
    schedule.status = 'cancelled';
    const updated = await this.scheduleRepo.save(schedule);

    // Cancel slots as well
    await this.slotRepo.update({ scheduleId: id }, { status: 'cancelled' });

    await this.logAudit({
      scheduleId: id,
      actorId: user?.id,
      actorEmail: user?.email || 'admin@codeskill.ac.in',
      actorRole: user?.role || 'admin',
      action: 'SCHEDULE_CANCELLED',
      reason: reason || 'Schedule cancelled by administrator',
      previousState: { status: previousStatus },
      newState: { status: 'cancelled' },
    });

    return updated;
  }

  async deleteSchedule(id: string, user: any): Promise<{ success: boolean }> {
    const schedule = await this.scheduleRepo.findOne({ where: { id } });
    if (!schedule) {
      throw new NotFoundException(`Exam schedule with ID "${id}" not found`);
    }

    if (schedule.status === 'published') {
      const activeAttempts = await this.assignmentRepo.count({
        where: { scheduleId: id, status: 'in_progress' },
      });
      if (activeAttempts > 0) {
        throw new BadRequestException(
          'Cannot delete published schedule with active in-progress student attempts. Cancel the schedule first.',
        );
      }
    }

    await this.scheduleRepo.delete(id);

    await this.logAudit({
      scheduleId: id,
      actorId: user?.id,
      actorEmail: user?.email || 'admin@codeskill.ac.in',
      actorRole: user?.role || 'admin',
      action: 'SCHEDULE_DELETED',
      reason: 'Schedule deleted',
      previousState: schedule,
    });

    return { success: true };
  }

  // =========================================================================
  // 2. BATCH & TIME-SLOT MANAGEMENT
  // =========================================================================

  async createSlot(
    scheduleId: string,
    dto: CreateExamSlotDto,
    user: any,
  ): Promise<ExamSlot> {
    const schedule = await this.scheduleRepo.findOne({ where: { id: scheduleId } });
    if (!schedule) {
      throw new NotFoundException(`Schedule with ID "${scheduleId}" not found`);
    }

    const start = new Date(dto.startTime);
    const end = new Date(dto.endTime);
    if (end <= start) {
      throw new BadRequestException('Slot end time must be after start time');
    }

    const slot = this.slotRepo.create({
      scheduleId,
      name: dto.name.trim(),
      slotCode: dto.slotCode.trim().toUpperCase(),
      date: dto.date,
      startTime: start,
      endTime: end,
      capacity: Math.max(1, dto.capacity),
      assignedCount: 0,
      status: 'scheduled',
      roomOrLab: dto.roomOrLab || '',
    });

    const saved = await this.slotRepo.save(slot);

    await this.logAudit({
      scheduleId,
      slotId: saved.id,
      actorId: user?.id,
      actorEmail: user?.email || 'admin@codeskill.ac.in',
      actorRole: user?.role || 'admin',
      action: 'SLOT_CREATED',
      reason: `Slot ${saved.name} (${saved.slotCode}) created`,
      newState: saved,
    });

    return saved;
  }

  async autoGenerateSlots(
    scheduleId: string,
    dto: AutoGenerateSlotsDto,
    user: any,
  ): Promise<ExamSlot[]> {
    const schedule = await this.scheduleRepo.findOne({ where: { id: scheduleId } });
    if (!schedule) {
      throw new NotFoundException(`Schedule with ID "${scheduleId}" not found`);
    }

    const createdSlots: ExamSlot[] = [];
    const baseDate = new Date(dto.startDate);

    const [startHour, startMinute] = dto.dailyStartTime.split(':').map(Number);
    const totalDays = Math.max(1, Math.min(14, dto.totalDays ?? 1));
    const slotsPerDay = Math.max(1, Math.min(10, dto.slotsPerDay ?? 4));
    const slotDuration = Math.max(15, Math.min(360, dto.slotDurationMinutes ?? 60));
    const gapMinutes = Math.max(0, Math.min(240, dto.gapMinutes ?? dto.breakDurationMinutes ?? 30));
    const capacityPerSlot = Math.max(1, dto.capacityPerSlot ?? 300);
    const prefix = dto.namePrefix || dto.slotPrefix || 'Slot';

    for (let day = 0; day < totalDays; day++) {
      const currentDay = new Date(baseDate);
      currentDay.setDate(currentDay.getDate() + day);
      const dateStr = currentDay.toISOString().split('T')[0];

      let slotStartMinutes = startHour * 60 + startMinute;

      for (let s = 1; s <= slotsPerDay; s++) {
        const slotStart = new Date(currentDay);
        slotStart.setHours(Math.floor(slotStartMinutes / 60), slotStartMinutes % 60, 0, 0);

        const slotEndMinutes = slotStartMinutes + slotDuration;
        const slotEnd = new Date(currentDay);
        slotEnd.setHours(Math.floor(slotEndMinutes / 60), slotEndMinutes % 60, 0, 0);

        const slotIndex = day * slotsPerDay + s;
        const codeNum = String(slotIndex).padStart(2, '0');

        const slot = this.slotRepo.create({
          scheduleId,
          name: `${prefix} ${slotIndex} (Day ${day + 1})`,
          slotCode: `SLOT-${codeNum}`,
          date: dateStr,
          startTime: slotStart,
          endTime: slotEnd,
          capacity: capacityPerSlot,
          assignedCount: 0,
          status: 'scheduled',
        });

        createdSlots.push(slot);
        slotStartMinutes = slotEndMinutes + gapMinutes;
      }
    }

    const saved = await this.slotRepo.save(createdSlots);

    await this.logAudit({
      scheduleId,
      actorId: user?.id,
      actorEmail: user?.email || 'admin@codeskill.ac.in',
      actorRole: user?.role || 'admin',
      action: 'SLOTS_AUTO_GENERATED',
      reason: `Auto-generated ${saved.length} slots across ${dto.totalDays} days with capacity ${dto.capacityPerSlot} each`,
      newState: { slotsCount: saved.length },
    });

    return saved;
  }

  async updateSlot(
    scheduleId: string,
    slotId: string,
    dto: Partial<CreateExamSlotDto>,
    user: any,
  ): Promise<ExamSlot> {
    const slot = await this.slotRepo.findOne({
      where: { id: slotId, scheduleId },
    });
    if (!slot) {
      throw new NotFoundException(`Exam slot with ID "${slotId}" not found in this schedule`);
    }

    const previousState = { ...slot };

    if (dto.name) slot.name = dto.name.trim();
    if (dto.slotCode) slot.slotCode = dto.slotCode.trim().toUpperCase();
    if (dto.date) slot.date = dto.date;
    if (dto.startTime) slot.startTime = new Date(dto.startTime);
    if (dto.endTime) slot.endTime = new Date(dto.endTime);
    if (dto.capacity !== undefined) {
      if (dto.capacity < slot.assignedCount) {
        throw new BadRequestException(
          `Cannot reduce slot capacity to ${dto.capacity} below currently assigned students (${slot.assignedCount})`,
        );
      }
      slot.capacity = dto.capacity;
    }
    if (dto.roomOrLab !== undefined) slot.roomOrLab = dto.roomOrLab;

    const saved = await this.slotRepo.save(slot);

    // If timings changed, update access window for assigned students
    if (dto.startTime || dto.endTime) {
      const schedule = await this.scheduleRepo.findOne({ where: { id: scheduleId } });
      const earlyAccess = schedule?.config?.earlyAccessMinutes ?? 5;
      const gracePeriod = schedule?.config?.gracePeriodMinutes ?? 5;

      const newWindowStart = new Date(saved.startTime.getTime() - earlyAccess * 60_000);
      const newWindowEnd = new Date(saved.endTime.getTime() + gracePeriod * 60_000);

      await this.assignmentRepo.update(
        { slotId: saved.id },
        { accessWindowStart: newWindowStart, accessWindowEnd: newWindowEnd },
      );
    }

    await this.logAudit({
      scheduleId,
      slotId,
      actorId: user?.id,
      actorEmail: user?.email || 'admin@codeskill.ac.in',
      actorRole: user?.role || 'admin',
      action: 'SLOT_UPDATED',
      reason: 'Slot parameters modified',
      previousState,
      newState: saved,
    });

    return saved;
  }

  async deleteSlot(
    scheduleId: string,
    slotId: string,
    user: any,
  ): Promise<{ success: boolean; unassignedCount: number }> {
    const slot = await this.slotRepo.findOne({
      where: { id: slotId, scheduleId },
    });
    if (!slot) {
      throw new NotFoundException(`Slot "${slotId}" not found`);
    }

    // Set slotId to null for assigned students and reset to 'eligible'
    const assigned = await this.assignmentRepo.find({ where: { slotId } });
    if (assigned.length > 0) {
      await this.assignmentRepo.update(
        { slotId },
        { slotId: undefined, status: 'eligible', accessWindowStart: undefined, accessWindowEnd: undefined },
      );
    }

    await this.slotRepo.delete(slotId);

    // Update schedule assigned count
    await this.refreshScheduleStudentCounts(scheduleId);

    await this.logAudit({
      scheduleId,
      slotId,
      actorId: user?.id,
      actorEmail: user?.email || 'admin@codeskill.ac.in',
      actorRole: user?.role || 'admin',
      action: 'SLOT_DELETED',
      reason: `Slot ${slot.name} deleted; ${assigned.length} students moved to unassigned pool`,
    });

    return { success: true, unassignedCount: assigned.length };
  }

  // =========================================================================
  // 3. STUDENT FILTERING, LIVE PREVIEWS & CSV VALIDATION
  // =========================================================================

  private buildStudentFilterQueryBuilder(criteria: StudentFilterCriteriaDto) {
    const qb = this.userRepo
      .createQueryBuilder('u')
      .where('(u.role = \'student\' OR u."isAssessmentStudent" = true)');

    if (criteria.search && String(criteria.search).trim() !== '') {
      qb.andWhere(
        '(LOWER(u.name) LIKE :search OR LOWER(u.email) LIKE :search OR LOWER(COALESCE(u.uid, \'\')) LIKE :search)',
        { search: `%${String(criteria.search).trim().toLowerCase()}%` },
      );
    }

    if (criteria.semester !== undefined && criteria.semester !== null && String(criteria.semester).trim() !== '') {
      const semNum = Number(criteria.semester);
      if (!isNaN(semNum)) {
        qb.andWhere(
          "(u.\"studentProfile\"->>'semester' ~ '^[0-9]+$' AND (u.\"studentProfile\"->>'semester')::int = :semester)",
          { semester: semNum },
        );
      }
    }

    if (criteria.department && String(criteria.department).trim() !== '') {
      qb.andWhere("LOWER(COALESCE(u.\"studentProfile\"->>'department', '')) = :dept", {
        dept: String(criteria.department).trim().toLowerCase(),
      });
    }

    if (criteria.program && String(criteria.program).trim() !== '') {
      qb.andWhere("LOWER(COALESCE(u.\"studentProfile\"->>'course', '')) = :program", {
        program: String(criteria.program).trim().toLowerCase(),
      });
    }

    if (criteria.section && String(criteria.section).trim() !== '') {
      qb.andWhere("LOWER(COALESCE(u.\"studentProfile\"->>'section', '')) = :section", {
        section: String(criteria.section).trim().toLowerCase(),
      });
    }

    if (criteria.batch && String(criteria.batch).trim() !== '') {
      qb.andWhere("LOWER(COALESCE(u.\"studentProfile\"->>'batch', '')) = :batch", {
        batch: String(criteria.batch).trim().toLowerCase(),
      });
    }

    if (criteria.year !== undefined && criteria.year !== null && String(criteria.year).trim() !== '') {
      const yearNum = Number(criteria.year);
      if (!isNaN(yearNum)) {
        qb.andWhere(
          "(u.\"studentProfile\"->>'year' ~ '^[0-9]+$' AND (u.\"studentProfile\"->>'year')::int = :year)",
          { year: yearNum },
        );
      }
    }

    if (criteria.isActive !== undefined && criteria.isActive !== null && String(criteria.isActive).trim() !== '') {
      const activeBool = String(criteria.isActive) === 'true';
      qb.andWhere('u."isActive" = :isActive', { isActive: activeBool });
    }

    if (criteria.excludeStudentIds && criteria.excludeStudentIds.length > 0) {
      qb.andWhere('u.id NOT IN (:...excludeIds)', { excludeIds: criteria.excludeStudentIds });
      qb.andWhere('(u.uid IS NULL OR u.uid NOT IN (:...excludeUids))', { excludeUids: criteria.excludeStudentIds });
    }

    return qb;
  }

  async searchStudents(
    criteria: StudentFilterCriteriaDto,
    page = 1,
    limit = 20,
  ): Promise<any> {
    const p = Math.max(1, Number(page) || 1);
    const l = Math.max(1, Math.min(200, Number(limit) || 20));
    const skip = (p - 1) * l;

    const qb = this.buildStudentFilterQueryBuilder(criteria);
    qb.select([
      'u.id',
      'u.uid',
      'u.name',
      'u.email',
      'u.studentProfile',
      'u.isActive',
      'u.createdAt',
    ])
      .orderBy('u.name', 'ASC')
      .skip(skip)
      .take(l);

    const [students, total] = await qb.getManyAndCount();

    const formatted = students.map((s) => ({
      id: s.id,
      uid: s.uid || 'UNKNOWN',
      name: s.name,
      email: s.email,
      department: s.studentProfile?.department || '',
      course: s.studentProfile?.course || '',
      semester: s.studentProfile?.semester ?? null,
      section: s.studentProfile?.section || '',
      batch: s.studentProfile?.batch || '',
      isActive: s.isActive,
    }));

    const totalPages = Math.ceil(total / l);

    return {
      students: formatted,
      total,
      page: p,
      limit: l,
      totalPages,
      pagination: {
        page: p,
        limit: l,
        total,
        totalPages,
      },
    };
  }

  async previewStudentCount(criteria: StudentFilterCriteriaDto): Promise<{ count: number }> {
    const qb = this.buildStudentFilterQueryBuilder(criteria);
    const count = await qb.getCount();
    return { count };
  }

  async validateCsv(
    scheduleId: string,
    fileBuffer: Buffer,
  ): Promise<CsvValidationResultDto> {
    const content = fileBuffer.toString('utf-8');
    const lines = content
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) {
      throw new BadRequestException('Uploaded CSV file is empty');
    }

    // Header check
    let startIndex = 0;
    const headerLine = lines[0].toLowerCase();
    if (headerLine.includes('uid') || headerLine.includes('roll') || headerLine.includes('student')) {
      startIndex = 1;
    }

    const rawIdentifiers: string[] = [];
    for (let i = startIndex; i < lines.length; i++) {
      const parts = lines[i].split(',').map((p) => p.trim().replace(/^["']|["']$/g, ''));
      if (parts[0]) {
        rawIdentifiers.push(parts[0]);
      }
    }

    const duplicateUids: string[] = [];
    const seen = new Set<string>();
    const uniqueUids: string[] = [];

    for (const uid of rawIdentifiers) {
      const lower = uid.toLowerCase();
      if (seen.has(lower)) {
        duplicateUids.push(uid);
      } else {
        seen.add(lower);
        uniqueUids.push(uid);
      }
    }

    // Match against database
    const matchedUsers = await this.userRepo
      .createQueryBuilder('u')
      .where('LOWER(u.uid) IN (:...uids) OR LOWER(u.email) IN (:...uids)', {
        uids: uniqueUids.map((u) => u.toLowerCase()),
      })
      .select(['u.id', 'u.uid', 'u.name', 'u.email', 'u.studentProfile'])
      .getMany();

    const matchedMap = new Map<string, User>();
    matchedUsers.forEach((u) => {
      if (u.uid) matchedMap.set(u.uid.toLowerCase(), u);
      if (u.email) matchedMap.set(u.email.toLowerCase(), u);
    });

    const unknownUids: string[] = [];
    const matchedStudents: any[] = [];

    for (const uid of uniqueUids) {
      const user = matchedMap.get(uid.toLowerCase());
      if (!user) {
        unknownUids.push(uid);
      } else {
        matchedStudents.push({
          id: user.id,
          uid: user.uid || uid,
          name: user.name,
          email: user.email,
          department: user.studentProfile?.department || '',
          semester: user.studentProfile?.semester ?? null,
          section: user.studentProfile?.section || '',
        });
      }
    }

    // Check already assigned in this schedule
    const matchedIds = matchedStudents.map((s) => s.id);
    let alreadyAssignedUids: string[] = [];
    if (matchedIds.length > 0) {
      const existingAssignments = await this.assignmentRepo.find({
        where: { scheduleId, studentId: In(matchedIds) },
        select: { studentUid: true },
      });
      alreadyAssignedUids = existingAssignments.map((a) => a.studentUid);
    }

    return {
      matchedStudents,
      unknownUids,
      duplicateUids,
      alreadyAssignedUids,
      conflictingUids: [],
    };
  }

  // =========================================================================
  // 4. BULK STUDENT ASSIGNMENT & ALLOCATION
  // =========================================================================

  async bulkAssignStudents(
    scheduleId: string,
    dto: BulkAssignStudentsDto,
    user: any,
  ): Promise<{ assignedCount: number; totalEligible: number }> {
    const schedule = await this.scheduleRepo.findOne({
      where: { id: scheduleId },
      relations: { assessment: true },
    });
    if (!schedule) {
      throw new NotFoundException(`Schedule with ID "${scheduleId}" not found`);
    }

    let candidateStudents: User[] = [];

    if (dto.source === 'filter' && dto.filterCriteria) {
      const qb = this.buildStudentFilterQueryBuilder(dto.filterCriteria);
      candidateStudents = await qb.getMany();
    } else if (dto.source === 'manual' || dto.source === 'csv') {
      const idsOrUids = dto.studentIds || [];
      if (idsOrUids.length === 0) {
        throw new BadRequestException('No student IDs or UIDs provided for assignment');
      }
      candidateStudents = await this.userRepo
        .createQueryBuilder('u')
        .where('u.id IN (:...ids) OR u.uid IN (:...ids)', { ids: idsOrUids })
        .getMany();
    } else if (dto.source === 'saved_group' && dto.savedGroupId) {
      const group = await this.savedGroupRepo.findOne({
        where: { id: dto.savedGroupId },
      });
      if (!group) {
        throw new NotFoundException(`Saved group "${dto.savedGroupId}" not found`);
      }
      if (group.groupType === 'filter_dynamic' && group.filterCriteria) {
        const qb = this.buildStudentFilterQueryBuilder(group.filterCriteria);
        candidateStudents = await qb.getMany();
      } else {
        const sIds = group.studentIds || [];
        if (sIds.length > 0) {
          candidateStudents = await this.userRepo.find({ where: { id: In(sIds) } });
        }
      }
    }

    if (candidateStudents.length === 0) {
      throw new BadRequestException('No matching students found to assign');
    }

    let targetSlot: ExamSlot | null = null;
    if (dto.targetSlotId) {
      targetSlot = await this.slotRepo.findOne({
        where: { id: dto.targetSlotId, scheduleId },
      });
      if (!targetSlot) {
        throw new NotFoundException(`Target slot "${dto.targetSlotId}" not found in this schedule`);
      }
    }

    const earlyAccess = schedule.config?.earlyAccessMinutes ?? 5;
    const gracePeriod = schedule.config?.gracePeriodMinutes ?? 5;

    let newlyAssigned = 0;
    const batchSize = 500;

    // Process in bounded batches for scale (3,000+ students)
    for (let i = 0; i < candidateStudents.length; i += batchSize) {
      const chunk = candidateStudents.slice(i, i + batchSize);

      await this.dataSource.transaction(async (manager) => {
        for (const student of chunk) {
          const profile = student.studentProfile || {};

          let windowStart: Date | undefined;
          let windowEnd: Date | undefined;

          if (targetSlot) {
            windowStart = new Date(targetSlot.startTime.getTime() - earlyAccess * 60_000);
            windowEnd = new Date(targetSlot.endTime.getTime() + gracePeriod * 60_000);
          }

          const existing = await manager.findOne(ExamEligibilityAssignment, {
            where: { scheduleId, studentId: student.id },
          });

          if (!existing) {
            const assignment = manager.create(ExamEligibilityAssignment, {
              scheduleId,
              slotId: targetSlot?.id,
              assessmentId: schedule.assessmentId,
              studentId: student.id,
              studentUid: student.uid || 'UNKNOWN',
              studentEmail: student.email,
              studentName: student.name,
              academicSnapshot: {
                department: profile.department || '',
                course: profile.course || '',
                semester: profile.semester ?? schedule.semester,
                section: profile.section || '',
                batch: profile.batch || '',
                year: profile.year ?? schedule.academicYear,
              },
              status: targetSlot ? 'assigned' : 'eligible',
              assignmentSource: dto.source,
              accessWindowStart: windowStart,
              accessWindowEnd: windowEnd,
            });

            await manager.save(assignment);
            newlyAssigned++;
          }
        }
      });
    }

    // Refresh assigned counts
    if (targetSlot) {
      const slotCount = await this.assignmentRepo.count({
        where: { slotId: targetSlot.id },
      });
      targetSlot.assignedCount = slotCount;
      await this.slotRepo.save(targetSlot);
    }

    const totalEligible = await this.refreshScheduleStudentCounts(scheduleId);

    await this.logAudit({
      scheduleId,
      actorId: user?.id,
      actorEmail: user?.email || 'admin@codeskill.ac.in',
      actorRole: user?.role || 'admin',
      action: 'STUDENTS_ASSIGNED',
      reason: `Assigned ${newlyAssigned} students via ${dto.source}`,
      newState: { newlyAssigned, totalEligible },
    });

    return { assignedCount: newlyAssigned, totalEligible };
  }

  async allocateStudentsToSlots(
    scheduleId: string,
    dto: AllocateStudentsDto,
    user: any,
  ): Promise<{ allocatedCount: number; slots: any[] }> {
    const schedule = await this.scheduleRepo.findOne({ where: { id: scheduleId } });
    if (!schedule) {
      throw new NotFoundException(`Schedule "${scheduleId}" not found`);
    }

    let slots = await this.slotRepo.find({
      where: {
        scheduleId,
        status: 'scheduled',
        ...(dto.slotIds && dto.slotIds.length > 0 ? { id: In(dto.slotIds) } : {}),
      },
      order: { startTime: 'ASC' },
    });

    if (slots.length === 0) {
      throw new BadRequestException('No active slots available for allocation');
    }

    // Fetch unassigned assignments (or all unstarted if rebalanceExisting=true)
    const statusFilter = dto.rebalanceExisting
      ? In(['eligible', 'assigned', 'rescheduled'])
      : In(['eligible']);

    const assignments = await this.assignmentRepo.find({
      where: { scheduleId, status: statusFilter },
    });

    if (assignments.length === 0) {
      return { allocatedCount: 0, slots };
    }

    // Allocation strategies
    let orderedAssignments = [...assignments];

    if (dto.strategy === 'random') {
      orderedAssignments = this.shuffle(orderedAssignments);
    } else if (dto.strategy === 'section_grouped') {
      // Group by section so section cohorts take exam in the same slot
      orderedAssignments.sort((a, b) => {
        const secA = (a.academicSnapshot?.section || '').toLowerCase();
        const secB = (b.academicSnapshot?.section || '').toLowerCase();
        return secA.localeCompare(secB);
      });
    }

    const earlyAccess = schedule.config?.earlyAccessMinutes ?? 5;
    const gracePeriod = schedule.config?.gracePeriodMinutes ?? 5;

    const slotAllocations = new Map<string, ExamEligibilityAssignment[]>();
    slots.forEach((s) => slotAllocations.set(s.id, []));

    if (dto.strategy === 'balanced') {
      // Round-robin distribution respecting capacity
      let slotIdx = 0;
      for (const assignment of orderedAssignments) {
        let attempts = 0;
        let placed = false;
        while (attempts < slots.length) {
          const currentSlot = slots[slotIdx];
          const currentCount = slotAllocations.get(currentSlot.id)!.length;
          if (currentCount < currentSlot.capacity) {
            slotAllocations.get(currentSlot.id)!.push(assignment);
            placed = true;
            slotIdx = (slotIdx + 1) % slots.length;
            break;
          }
          slotIdx = (slotIdx + 1) % slots.length;
          attempts++;
        }
        if (!placed) {
          this.logger.warn(`Could not place assignment ${assignment.id}: all slots at capacity`);
        }
      }
    } else {
      // Sequential / section_grouped
      let slotIdx = 0;
      for (const assignment of orderedAssignments) {
        while (slotIdx < slots.length && slotAllocations.get(slots[slotIdx].id)!.length >= slots[slotIdx].capacity) {
          slotIdx++;
        }
        if (slotIdx >= slots.length) {
          break; // Capacity exhausted
        }
        slotAllocations.get(slots[slotIdx].id)!.push(assignment);
      }
    }

    let allocatedTotal = 0;

    await this.dataSource.transaction(async (manager) => {
      for (const slot of slots) {
        const assignedToSlot = slotAllocations.get(slot.id) || [];
        if (assignedToSlot.length === 0) continue;

        const windowStart = new Date(slot.startTime.getTime() - earlyAccess * 60_000);
        const windowEnd = new Date(slot.endTime.getTime() + gracePeriod * 60_000);

        for (const assign of assignedToSlot) {
          assign.slotId = slot.id;
          assign.status = 'assigned';
          assign.accessWindowStart = windowStart;
          assign.accessWindowEnd = windowEnd;
          await manager.save(assign);
          allocatedTotal++;
        }

        const newCount = await manager.count(ExamEligibilityAssignment, {
          where: { slotId: slot.id },
        });
        slot.assignedCount = newCount;
        await manager.save(slot);
      }
    });

    await this.refreshScheduleStudentCounts(scheduleId);

    // Re-fetch updated slots
    slots = await this.slotRepo.find({
      where: { scheduleId },
      order: { startTime: 'ASC' },
    });

    await this.logAudit({
      scheduleId,
      actorId: user?.id,
      actorEmail: user?.email || 'admin@codeskill.ac.in',
      actorRole: user?.role || 'admin',
      action: 'SLOTS_ALLOCATED',
      reason: `Allocated ${allocatedTotal} students across ${slots.length} slots using "${dto.strategy}" strategy`,
      newState: { allocatedTotal, strategy: dto.strategy },
    });

    return { allocatedCount: allocatedTotal, slots };
  }

  async reassignStudentSlot(
    scheduleId: string,
    dto: ReassignStudentSlotDto,
    user: any,
  ): Promise<ExamEligibilityAssignment> {
    const targetId = dto.assignmentId || dto.studentId;
    if (!targetId) {
      throw new BadRequestException('Target assignmentId or studentId is required');
    }
    const assignment = await this.assignmentRepo.findOne({
      where: [
        { id: targetId, scheduleId },
        { studentId: targetId, scheduleId },
      ],
      relations: { slot: true },
    });
    if (!assignment) {
      throw new NotFoundException(`Assignment for student/ID "${targetId}" not found`);
    }

    if (assignment.status === 'in_progress' || assignment.status === 'completed') {
      throw new BadRequestException(
        `Cannot reassign student whose exam is already "${assignment.status}".`,
      );
    }

    const targetSlot = await this.slotRepo.findOne({
      where: { id: dto.targetSlotId, scheduleId },
    });
    if (!targetSlot) {
      throw new NotFoundException(`Target slot "${dto.targetSlotId}" not found`);
    }

    if (targetSlot.assignedCount >= targetSlot.capacity) {
      throw new BadRequestException(
        `Target slot "${targetSlot.name}" is already at full capacity (${targetSlot.capacity}).`,
      );
    }

    const schedule = await this.scheduleRepo.findOne({ where: { id: scheduleId } });
    const earlyAccess = schedule?.config?.earlyAccessMinutes ?? 5;
    const gracePeriod = schedule?.config?.gracePeriodMinutes ?? 5;

    const previousSlotId = assignment.slotId;

    assignment.slotId = targetSlot.id;
    assignment.status = 'rescheduled';
    assignment.accessWindowStart = new Date(targetSlot.startTime.getTime() - earlyAccess * 60_000);
    assignment.accessWindowEnd = new Date(targetSlot.endTime.getTime() + gracePeriod * 60_000);
    assignment.overrideReason = dto.reason || 'Manually rescheduled by administrator';
    assignment.overrideById = user?.id;
    assignment.overrideAt = new Date();

    const saved = await this.assignmentRepo.save(assignment);

    // Refresh slot counts
    if (previousSlotId) {
      const prevCount = await this.assignmentRepo.count({ where: { slotId: previousSlotId } });
      await this.slotRepo.update({ id: previousSlotId }, { assignedCount: prevCount });
    }
    const targetCount = await this.assignmentRepo.count({ where: { slotId: targetSlot.id } });
    await this.slotRepo.update({ id: targetSlot.id }, { assignedCount: targetCount });

    await this.logAudit({
      scheduleId,
      slotId: targetSlot.id,
      studentId: assignment.studentId,
      studentUid: assignment.studentUid,
      actorId: user?.id,
      actorEmail: user?.email || 'admin@codeskill.ac.in',
      actorRole: user?.role || 'admin',
      action: 'STUDENT_RESCHEDULED',
      reason: dto.reason || 'Student reassigned to different exam slot',
      previousState: { slotId: previousSlotId },
      newState: { slotId: targetSlot.id, accessWindowStart: assignment.accessWindowStart },
    });

    return saved;
  }

  // =========================================================================
  // 5. ACCESS OVERRIDES & EXCEPTIONAL ACCESS
  // =========================================================================

  async revokeAccess(
    scheduleId: string,
    dto: RevokeStudentAccessDto,
    user: any,
  ): Promise<{ revokedCount: number }> {
    const rawTargets = [
      ...(dto.assignmentIds || []),
      dto.assignmentId,
      dto.studentId,
    ].filter(Boolean) as string[];

    if (rawTargets.length === 0) {
      throw new BadRequestException('No assignmentIds or studentId provided to revoke');
    }

    const assignments = await this.assignmentRepo.find({
      where: [
        { id: In(rawTargets), scheduleId },
        { studentId: In(rawTargets), scheduleId },
      ],
    });

    if (assignments.length === 0) {
      throw new NotFoundException('No matching student assignments found to revoke');
    }

    for (const a of assignments) {
      const prevStatus = a.status;
      a.status = 'revoked';
      a.overrideReason = dto.reason;
      a.overrideById = user?.id;
      a.overrideAt = new Date();
      await this.assignmentRepo.save(a);

      await this.logAudit({
        scheduleId,
        slotId: a.slotId,
        studentId: a.studentId,
        studentUid: a.studentUid,
        actorId: user?.id,
        actorEmail: user?.email || 'admin@codeskill.ac.in',
        actorRole: user?.role || 'admin',
        action: 'ACCESS_REVOKED',
        reason: dto.reason,
        previousState: { status: prevStatus },
        newState: { status: 'revoked' },
      });
    }

    return { revokedCount: assignments.length };
  }

  async grantException(
    scheduleId: string,
    dto: GrantExceptionAccessDto,
    user: any,
  ): Promise<ExamEligibilityAssignment> {
    const targetId = dto.assignmentId || dto.studentId;
    if (!targetId) {
      throw new BadRequestException('Target assignmentId or studentId is required');
    }

    const assignment = await this.assignmentRepo.findOne({
      where: [
        { id: targetId, scheduleId },
        { studentId: targetId, scheduleId },
      ],
      relations: { slot: true },
    });
    if (!assignment) {
      throw new NotFoundException(`Assignment for student/ID "${targetId}" not found`);
    }

    const previousWindowEnd = assignment.accessWindowEnd;

    if (dto.newAccessWindowStart) {
      assignment.accessWindowStart = new Date(dto.newAccessWindowStart);
    }

    if (dto.newAccessWindowEnd) {
      assignment.accessWindowEnd = new Date(dto.newAccessWindowEnd);
    } else if (dto.extraTimeMinutes && assignment.accessWindowEnd) {
      assignment.accessWindowEnd = new Date(
        assignment.accessWindowEnd.getTime() + dto.extraTimeMinutes * 60_000,
      );
    }

    assignment.overrideReason = dto.reason;
    assignment.overrideById = user?.id;
    assignment.overrideAt = new Date();

    // If student was expired or revoked, reinstate to eligible/assigned
    if (assignment.status === 'expired' || assignment.status === 'revoked') {
      assignment.status = assignment.slotId ? 'assigned' : 'eligible';
    }

    const saved = await this.assignmentRepo.save(assignment);

    await this.logAudit({
      scheduleId,
      slotId: assignment.slotId,
      studentId: assignment.studentId,
      studentUid: assignment.studentUid,
      actorId: user?.id,
      actorEmail: user?.email || 'admin@codeskill.ac.in',
      actorRole: user?.role || 'admin',
      action: 'EXCEPTION_GRANTED',
      reason: dto.reason,
      previousState: { accessWindowEnd: previousWindowEnd },
      newState: {
        accessWindowStart: saved.accessWindowStart,
        accessWindowEnd: saved.accessWindowEnd,
        extraTimeMinutes: dto.extraTimeMinutes,
      },
    });

    return saved;
  }

  async reinstateAccess(
    scheduleId: string,
    dto: ReinstateStudentAccessDto,
    user: any,
  ): Promise<ExamEligibilityAssignment> {
    const targetId = dto.assignmentId || dto.studentId;
    if (!targetId) {
      throw new BadRequestException('Target assignmentId or studentId is required');
    }

    const assignment = await this.assignmentRepo.findOne({
      where: [
        { id: targetId, scheduleId },
        { studentId: targetId, scheduleId },
      ],
    });
    if (!assignment) {
      throw new NotFoundException(`Assignment for student/ID "${targetId}" not found`);
    }

    assignment.status = dto.targetSlotId ? 'assigned' : 'eligible';
    if (dto.targetSlotId) {
      assignment.slotId = dto.targetSlotId;
    }
    assignment.overrideReason = dto.reason;
    assignment.overrideById = user?.id;
    assignment.overrideAt = new Date();

    const saved = await this.assignmentRepo.save(assignment);

    await this.logAudit({
      scheduleId,
      slotId: saved.slotId,
      studentId: saved.studentId,
      studentUid: saved.studentUid,
      actorId: user?.id,
      actorEmail: user?.email || 'admin@codeskill.ac.in',
      actorRole: user?.role || 'admin',
      action: 'ACCESS_REINSTATED',
      reason: dto.reason,
      newState: { status: saved.status },
    });

    return saved;
  }

  // =========================================================================
  // 6. ASSIGNMENTS, ATTENDANCE & REPORTING
  // =========================================================================

  async getAssignments(
    scheduleId: string,
    query: QueryStudentAssignmentsDto,
  ): Promise<{ assignments: any[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(200, Number(query.limit) || 50));
    const skip = (page - 1) * limit;

    const qb = this.assignmentRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.slot', 's')
      .leftJoinAndSelect('a.attempt', 'att')
      .where('a.scheduleId = :scheduleId', { scheduleId });

    if (query.slotId) {
      if (query.slotId === 'unassigned') {
        qb.andWhere('a.slotId IS NULL');
      } else {
        qb.andWhere('a.slotId = :slotId', { slotId: query.slotId });
      }
    }

    if (query.status) {
      qb.andWhere('a.status = :status', { status: query.status });
    }

    if (query.search) {
      qb.andWhere(
        '(LOWER(a.studentName) LIKE :search OR LOWER(a.studentEmail) LIKE :search OR LOWER(a.studentUid) LIKE :search)',
        { search: `%${query.search.toLowerCase()}%` },
      );
    }

    if (query.section) {
      qb.andWhere("LOWER(COALESCE(a.academicSnapshot->>'section', '')) = :section", {
        section: query.section.toLowerCase(),
      });
    }

    if (query.department) {
      qb.andWhere("LOWER(COALESCE(a.academicSnapshot->>'department', '')) = :dept", {
        dept: query.department.toLowerCase(),
      });
    }

    qb.orderBy('a.studentName', 'ASC').skip(skip).take(limit);

    const [assignments, total] = await qb.getManyAndCount();

    const formatted = assignments.map((a) => ({
      id: a.id,
      studentId: a.studentId,
      studentUid: a.studentUid,
      studentName: a.studentName,
      studentEmail: a.studentEmail,
      status: a.status,
      slotId: a.slotId,
      slotName: a.slot?.name || 'Unassigned',
      slotCode: a.slot?.slotCode || '',
      slotDate: a.slot?.date || '',
      slotStartTime: a.slot?.startTime,
      slotEndTime: a.slot?.endTime,
      slot: a.slot
        ? {
            id: a.slot.id,
            name: a.slot.name,
            slotCode: a.slot.slotCode,
            date: a.slot.date,
            startTime: a.slot.startTime,
            endTime: a.slot.endTime,
            roomOrLab: a.slot.roomOrLab,
            capacity: a.slot.capacity,
            assignedCount: a.slot.assignedCount,
          }
        : null,
      accessWindowStart: a.accessWindowStart,
      accessWindowEnd: a.accessWindowEnd,
      academicSnapshot: a.academicSnapshot,
      assignmentSource: a.assignmentSource,
      overrideReason: a.overrideReason,
      overrideAt: a.overrideAt,
      attemptId: a.attemptId,
      attemptStatus: a.attempt?.status || null,
      score: a.attempt?.score ?? null,
      passed: a.attempt?.passed ?? null,
    }));

    return { assignments: formatted, total, page, limit };
  }

  async getAttendanceSummary(scheduleId: string): Promise<any> {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!scheduleId || !uuidRegex.test(scheduleId)) {
      const emptyStats = {
        totalAssigned: 0,
        eligible: 0,
        scheduled: 0,
        inProgress: 0,
        completed: 0,
        absent: 0,
        revoked: 0,
        rescheduled: 0,
        exceptions: 0,
        expired: 0,
      };
      return {
        stats: emptyStats,
        slotBreakdown: [],
        ...emptyStats,
        slots: [],
        students: [],
      };
    }

    const assignments = await this.assignmentRepo.find({
      where: { scheduleId },
      relations: { slot: true, attempt: true },
    });

    const totalAssigned = assignments.length;
    let eligible = 0;
    let scheduled = 0;
    let inProgress = 0;
    let completed = 0;
    let absent = 0;
    let revoked = 0;
    let rescheduled = 0;
    let expired = 0;

    const slotMetrics = new Map<string, { assigned: number; inProgress: number; completed: number }>();

    const now = new Date();

    for (const a of assignments) {
      if (a.slotId && !slotMetrics.has(a.slotId)) {
        slotMetrics.set(a.slotId, { assigned: 0, inProgress: 0, completed: 0 });
      }

      if (a.status === 'revoked') {
        revoked++;
      } else if (a.status === 'rescheduled') {
        rescheduled++;
      } else if (a.attempt?.status === 'in_progress' || a.status === 'in_progress') {
        inProgress++;
        if (a.slotId) slotMetrics.get(a.slotId)!.inProgress++;
      } else if (
        a.attempt?.status === 'submitted' ||
        a.attempt?.status === 'auto_submitted' ||
        a.status === 'completed'
      ) {
        completed++;
        if (a.slotId) slotMetrics.get(a.slotId)!.completed++;
      } else if (a.accessWindowEnd && now > new Date(a.accessWindowEnd)) {
        absent++;
      } else if (a.slotId) {
        scheduled++;
        if (a.slotId) slotMetrics.get(a.slotId)!.assigned++;
      } else {
        eligible++;
      }
    }

    const slots = await this.slotRepo.find({
      where: { scheduleId },
      order: { startTime: 'ASC' },
    });

    const slotsWithStats = slots.map((s) => {
      const stats = slotMetrics.get(s.id) || { assigned: 0, inProgress: 0, completed: 0 };
      return {
        id: s.id,
        name: s.name,
        slotCode: s.slotCode,
        date: s.date,
        startTime: s.startTime,
        endTime: s.endTime,
        capacity: s.capacity,
        assignedCount: s.assignedCount,
        ...stats,
      };
    });

    const stats = {
      totalAssigned,
      eligible,
      scheduled,
      inProgress,
      completed,
      absent,
      revoked,
      rescheduled,
      exceptions: revoked + rescheduled,
      expired,
    };

    const slotBreakdown = slotsWithStats.map((s) => ({
      slotId: s.id,
      id: s.id,
      name: s.name,
      slotCode: s.slotCode,
      date: s.date,
      startTime: s.startTime,
      endTime: s.endTime,
      capacity: s.capacity,
      assignedCount: s.assignedCount,
      completed: s.completed,
      inProgress: s.inProgress,
      assigned: s.assigned,
      turnout: s.assignedCount > 0 ? Math.round((s.completed / s.assignedCount) * 100) : 0,
    }));

    return {
      stats,
      slotBreakdown,
      ...stats,
      slots: slotsWithStats,
      students: assignments.map((a) => ({
        id: a.id,
        studentId: a.studentId,
        studentUid: a.studentUid,
        studentName: a.studentName,
        studentEmail: a.studentEmail,
        status: a.status,
        slotName: a.slot?.name,
        slotCode: a.slot?.slotCode,
        attemptStatus:
          a.attempt?.status ||
          (a.status === 'completed' ? 'submitted' : a.status === 'in_progress' ? 'in_progress' : null),
        score: a.attempt?.score ?? null,
      })),
    };
  }

  async exportCsvReport(scheduleId: string): Promise<string> {
    const assignments = await this.assignmentRepo.find({
      where: { scheduleId },
      relations: { slot: true, attempt: true },
      order: { studentName: 'ASC' },
    });

    const headers = [
      'Student UID',
      'Student Name',
      'Email',
      'Department',
      'Semester',
      'Section',
      'Slot Name',
      'Slot Code',
      'Slot Date',
      'Start Time',
      'End Time',
      'Eligibility Status',
      'Exam Attempt Status',
      'Score',
      'Percentage',
      'Passed',
      'Override Reason',
    ];

    const rows = assignments.map((a) => {
      return [
        `"${a.studentUid || ''}"`,
        `"${a.studentName || ''}"`,
        `"${a.studentEmail || ''}"`,
        `"${a.academicSnapshot?.department || ''}"`,
        `"${a.academicSnapshot?.semester ?? ''}"`,
        `"${a.academicSnapshot?.section || ''}"`,
        `"${a.slot?.name || 'Unassigned'}"`,
        `"${a.slot?.slotCode || ''}"`,
        `"${a.slot?.date || ''}"`,
        `"${a.slot?.startTime ? new Date(a.slot.startTime).toISOString() : ''}"`,
        `"${a.slot?.endTime ? new Date(a.slot.endTime).toISOString() : ''}"`,
        `"${a.status}"`,
        `"${a.attempt?.status || 'not_started'}"`,
        `"${a.attempt?.score ?? ''}"`,
        `"${a.attempt?.percentage ?? ''}"`,
        `"${a.attempt?.passed ? 'YES' : 'NO'}"`,
        `"${(a.overrideReason || '').replace(/"/g, '""')}"`,
      ].join(',');
    });

    return [headers.join(','), ...rows].join('\n');
  }

  // =========================================================================
  // 7. AUDIT LOGS
  // =========================================================================

  async getAuditLogs(
    scheduleId?: string,
    page = 1,
    limit = 50,
  ): Promise<{ logs: ExamAccessAuditLog[]; total: number; page: number; limit: number }> {
    const p = Math.max(1, page);
    const l = Math.max(1, Math.min(100, limit));
    const skip = (p - 1) * l;

    const where: any = {};
    if (scheduleId) {
      where.scheduleId = scheduleId;
    }

    const [logs, total] = await this.auditRepo.findAndCount({
      where,
      relations: { actor: true },
      order: { createdAt: 'DESC' },
      skip,
      take: l,
    });

    return { logs, total, page: p, limit: l };
  }

  private async logAudit(data: {
    scheduleId?: string;
    slotId?: string;
    studentId?: string;
    studentUid?: string;
    actorId?: string;
    actorEmail: string;
    actorRole?: string;
    action: string;
    reason?: string;
    previousState?: any;
    newState?: any;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void> {
    try {
      const log = this.auditRepo.create({
        scheduleId: data.scheduleId,
        slotId: data.slotId,
        studentId: data.studentId,
        studentUid: data.studentUid,
        actorId: data.actorId,
        actorEmail: data.actorEmail,
        actorRole: data.actorRole || 'admin',
        action: data.action,
        reason: data.reason,
        previousState: data.previousState,
        newState: data.newState,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
      });
      await this.auditRepo.save(log);
    } catch (err: any) {
      this.logger.error(`Failed to record exam access audit log: ${err?.message}`);
    }
  }

  // =========================================================================
  // 8. SAVED GROUPS & REUSABLE COHORTS
  // =========================================================================

  async createSavedGroup(
    dto: CreateSavedGroupDto,
    user: any,
  ): Promise<ExamSavedGroup> {
    let studentCount = 0;
    let studentIds = dto.studentIds || [];

    if (dto.groupType === 'filter_dynamic' && dto.filterCriteria) {
      const qb = this.buildStudentFilterQueryBuilder(dto.filterCriteria);
      studentCount = await qb.getCount();
    } else {
      studentCount = studentIds.length;
    }

    const group = this.savedGroupRepo.create({
      name: dto.name.trim(),
      description: dto.description || '',
      groupType: dto.groupType,
      filterCriteria: dto.filterCriteria || {},
      studentIds,
      studentCount,
      createdById: user?.id,
    });

    return this.savedGroupRepo.save(group);
  }

  async getSavedGroups(): Promise<ExamSavedGroup[]> {
    return this.savedGroupRepo.find({
      order: { createdAt: 'DESC' },
    });
  }

  async deleteSavedGroup(id: string): Promise<{ success: boolean }> {
    await this.savedGroupRepo.delete(id);
    return { success: true };
  }

  // =========================================================================
  // 9. STUDENT SCHEDULE INQUIRIES & AUTHORITATIVE ENFORCEMENT
  // =========================================================================

  async getStudentSchedule(studentUser: any): Promise<any[]> {
    const studentKeys = [studentUser.id, studentUser._id, studentUser.uid].filter(Boolean);
    if (studentKeys.length === 0) return [];

    const assignments = await this.assignmentRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.schedule', 's')
      .leftJoinAndSelect('a.slot', 'slot')
      .leftJoinAndSelect('a.assessment', 'asm')
      .leftJoinAndSelect('a.attempt', 'att')
      .where('(a.studentId IN (:...keys) OR a.studentUid IN (:...keys))', {
        keys: studentKeys.map(String),
      })
      .andWhere("s.status = 'published'")
      .orderBy('slot.startTime', 'ASC')
      .getMany();

    const now = new Date();

    return assignments.map((a) => {
      const slot = a.slot;
      const schedule = a.schedule;
      const config = schedule.config;

      let studentStatus = 'Scheduled';
      let canStart = false;
      let timeRemainingSeconds = 0;

      if (a.status === 'revoked') {
        studentStatus = 'Access Revoked';
      } else if (a.attempt?.status === 'submitted' || a.attempt?.status === 'auto_submitted') {
        studentStatus = 'Completed';
      } else if (a.attempt?.status === 'in_progress') {
        studentStatus = 'In Progress';
        canStart = true;
      } else if (!slot) {
        studentStatus = 'Awaiting Slot Assignment';
      } else {
        const earlyAccess = config?.earlyAccessMinutes ?? 5;
        const gracePeriod = config?.gracePeriodMinutes ?? 5;
        const lateStartAllowance = config?.lateStartAllowanceMinutes ?? 15;

        const effectiveStart = new Date(slot.startTime.getTime() - earlyAccess * 60_000);
        const lateStartLimit = new Date(slot.startTime.getTime() + lateStartAllowance * 60_000);
        const effectiveEnd = new Date(slot.endTime.getTime() + gracePeriod * 60_000);

        if (now < effectiveStart) {
          studentStatus = 'Upcoming';
          timeRemainingSeconds = Math.max(0, Math.floor((effectiveStart.getTime() - now.getTime()) / 1000));
        } else if (now >= effectiveStart && now <= lateStartLimit) {
          studentStatus = 'Available to Start';
          canStart = true;
        } else if (now > lateStartLimit && now <= effectiveEnd) {
          // Late start window expired unless student has active attempt
          studentStatus = 'Late Window Closed';
          canStart = false;
        } else {
          studentStatus = 'Expired';
          canStart = false;
        }
      }

      return {
        assignmentId: a.id,
        assessmentId: a.assessmentId,
        assessmentTitle: a.assessment?.title || schedule.title,
        assessmentCode: a.assessment?.code || '',
        scheduleTitle: schedule.title,
        scheduleCode: schedule.code,
        slotName: slot?.name || 'Unassigned',
        slotCode: slot?.slotCode || '',
        slotDate: slot?.date || '',
        startTime: slot?.startTime,
        endTime: slot?.endTime,
        durationMinutes: config?.maxDurationMinutes || a.assessment?.durationMinutes || 60,
        status: studentStatus,
        canStart,
        timeRemainingSeconds,
        accessWindowStart: a.accessWindowStart,
        accessWindowEnd: a.accessWindowEnd,
        attemptId: a.attemptId,
        score: a.attempt?.score,
        passed: a.attempt?.passed,
      };
    });
  }

  /**
   * Authoritative gatekeeper verifying student eligibility before entering examination.
   */
  async verifyStudentAccess(
    assessmentId: string,
    studentUser: any,
  ): Promise<{
    isScheduled: boolean;
    isAllowed: boolean;
    reason?: string;
    slot?: ExamSlot;
    assignment?: ExamEligibilityAssignment;
    effectiveEndTime?: Date;
  }> {
    // Check if there is an active published schedule for this assessment
    const activeSchedule = await this.scheduleRepo.findOne({
      where: { assessmentId, status: 'published' },
    });

    if (!activeSchedule) {
      // Not managed by active schedule; defer to existing targeting rules
      return { isScheduled: false, isAllowed: true };
    }

    const studentKeys = [studentUser.id, studentUser._id, studentUser.uid].filter(Boolean);
    const assignment = await this.assignmentRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.slot', 's')
      .where('a.scheduleId = :scheduleId', { scheduleId: activeSchedule.id })
      .andWhere('(a.studentId IN (:...keys) OR a.studentUid IN (:...keys))', {
        keys: studentKeys.map(String),
      })
      .getOne();

    if (!assignment) {
      return {
        isScheduled: true,
        isAllowed: false,
        reason: 'You are not assigned to this scheduled examination batch. Please contact the examination administrator.',
      };
    }

    if (assignment.status === 'revoked') {
      return {
        isScheduled: true,
        isAllowed: false,
        reason: `Your exam access has been revoked: ${assignment.overrideReason || 'Administrative restriction'}`,
      };
    }

    if (!assignment.slotId || !assignment.slot) {
      return {
        isScheduled: true,
        isAllowed: false,
        reason: 'Your exam slot has not yet been assigned. Please check back shortly.',
      };
    }

    const slot = assignment.slot;
    const config = activeSchedule.config;
    const earlyAccess = config?.earlyAccessMinutes ?? 5;
    const lateStartAllowance = config?.lateStartAllowanceMinutes ?? 15;
    const gracePeriod = config?.gracePeriodMinutes ?? 5;

    const now = new Date();
    const effectiveStart = new Date(slot.startTime.getTime() - earlyAccess * 60_000);
    const lateStartLimit = new Date(slot.startTime.getTime() + lateStartAllowance * 60_000);
    const effectiveEnd = assignment.accessWindowEnd || new Date(slot.endTime.getTime() + gracePeriod * 60_000);

    // If candidate has an in-progress attempt, allow re-entry up to effectiveEnd
    const existingInProgress = await this.attemptRepo.findOne({
      where: {
        assessmentId,
        studentId: String(studentUser.id || studentUser._id),
        status: 'in_progress',
      },
    });

    if (existingInProgress) {
      if (now > effectiveEnd) {
        return {
          isScheduled: true,
          isAllowed: false,
          reason: 'Your scheduled exam slot and grace period have expired.',
        };
      }
      return {
        isScheduled: true,
        isAllowed: true,
        slot,
        assignment,
        effectiveEndTime: effectiveEnd,
      };
    }

    if (now < effectiveStart) {
      return {
        isScheduled: true,
        isAllowed: false,
        reason: `Your scheduled exam slot begins at ${slot.startTime.toLocaleTimeString()} (Early access opens at ${effectiveStart.toLocaleTimeString()}).`,
      };
    }

    if (now > lateStartLimit) {
      return {
        isScheduled: true,
        isAllowed: false,
        reason: `The late-start window of ${lateStartAllowance} minutes closed at ${lateStartLimit.toLocaleTimeString()}. You cannot begin a new attempt.`,
      };
    }

    if (now > effectiveEnd) {
      return {
        isScheduled: true,
        isAllowed: false,
        reason: 'This exam slot has concluded.',
      };
    }

    return {
      isScheduled: true,
      isAllowed: true,
      slot,
      assignment,
      effectiveEndTime: effectiveEnd,
    };
  }

  // =========================================================================
  // SMART BULK STUDENT IDENTIFIER MATCHING & SELECTION ENGINE
  // =========================================================================

  async matchIdentifiers(
    scheduleId: string,
    options: {
      fileBuffer?: Buffer;
      fileName?: string;
      rawText?: string;
      identifiers?: Array<{ uid?: string; email?: string }>;
    },
  ): Promise<IdentifierMatchResultDto> {
    const rawInputRows: Array<{ rowNumber: number; rawUid?: string; rawEmail?: string }> = [];

    // 1. Parse File if provided
    if (options.fileBuffer && options.fileBuffer.length > 0) {
      let parsedSheetRows: any[][] = [];
      try {
        const wb = xlsx.read(options.fileBuffer, { type: 'buffer', raw: true });
        if (wb.SheetNames.length > 0) {
          const sheet = wb.Sheets[wb.SheetNames[0]];
          parsedSheetRows = xlsx.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '' });
        }
      } catch (e) {
        parsedSheetRows = [];
      }

      if (parsedSheetRows.length > 0) {
        // Inspect row 0 for headers
        const headerRow = parsedSheetRows[0].map((c) => String(c || '').trim().toLowerCase());
        let uidCol = -1;
        let emailCol = -1;

        headerRow.forEach((col, idx) => {
          if (/(student_?uid|uid|roll_?no|enrollment_?no|rollno|reg_?no)/.test(col)) {
            if (uidCol === -1) uidCol = idx;
          }
          if (/(student_?email|email|mail)/.test(col)) {
            if (emailCol === -1) emailCol = idx;
          }
        });

        const startIdx = uidCol !== -1 || emailCol !== -1 ? 1 : 0;
        for (let r = startIdx; r < parsedSheetRows.length; r++) {
          const row = parsedSheetRows[r];
          if (!row || !Array.isArray(row) || row.every((c) => !String(c).trim())) continue;

          let rawUid = '';
          let rawEmail = '';

          if (uidCol !== -1) rawUid = String(row[uidCol] || '').trim();
          if (emailCol !== -1) rawEmail = String(row[emailCol] || '').trim();

          // If no headers matched, detect column by content
          if (uidCol === -1 && emailCol === -1) {
            for (const cell of row) {
              const val = String(cell || '').trim();
              if (!val) continue;
              if (val.includes('@') && val.includes('.')) {
                if (!rawEmail) rawEmail = val;
              } else {
                if (!rawUid) rawUid = val;
              }
            }
          }

          if (rawUid || rawEmail) {
            rawInputRows.push({ rowNumber: r + 1, rawUid, rawEmail });
          }
        }
      } else {
        // Fallback to text lines
        const textContent = options.fileBuffer.toString('utf-8');
        this.parseTextLinesIntoRows(textContent, rawInputRows);
      }
    }

    // 2. Parse Raw Text if provided
    if (options.rawText && options.rawText.trim().length > 0) {
      this.parseTextLinesIntoRows(options.rawText, rawInputRows);
    }

    // 3. Identifiers Array if provided
    if (options.identifiers && options.identifiers.length > 0) {
      options.identifiers.forEach((item) => {
        if (item.uid || item.email) {
          rawInputRows.push({
            rowNumber: rawInputRows.length + 1,
            rawUid: item.uid,
            rawEmail: item.email,
          });
        }
      });
    }

    if (rawInputRows.length === 0) {
      throw new BadRequestException('No student UIDs or email addresses found in the provided input.');
    }

    // Detect duplicates in input
    const seenUids = new Set<string>();
    const seenEmails = new Set<string>();
    const duplicateRecords: DuplicateRecordDto[] = [];
    const uniqueUidsToFetch = new Set<string>();
    const uniqueEmailsToFetch = new Set<string>();

    for (const row of rawInputRows) {
      const cleanUid = row.rawUid?.trim().toUpperCase();
      const cleanEmail = row.rawEmail?.trim().toLowerCase();

      let isDup = false;
      if (cleanUid) {
        if (seenUids.has(cleanUid)) {
          duplicateRecords.push({ rowNumber: row.rowNumber, identifier: cleanUid });
          isDup = true;
        } else {
          seenUids.add(cleanUid);
          uniqueUidsToFetch.add(cleanUid);
        }
      }

      if (cleanEmail) {
        if (seenEmails.has(cleanEmail)) {
          if (!isDup) {
            duplicateRecords.push({ rowNumber: row.rowNumber, identifier: cleanEmail });
          }
        } else {
          seenEmails.add(cleanEmail);
          uniqueEmailsToFetch.add(cleanEmail);
        }
      }
    }

    // Batch Query Database in chunks of 1000
    const matchedUsers: User[] = [];
    const uidList = Array.from(uniqueUidsToFetch);
    const emailList = Array.from(uniqueEmailsToFetch);

    for (let i = 0; i < uidList.length; i += 1000) {
      const chunk = uidList.slice(i, i + 1000);
      const found = await this.userRepo
        .createQueryBuilder('u')
        .where('UPPER(u.uid) IN (:...uids)', { uids: chunk })
        .select(['u.id', 'u.uid', 'u.name', 'u.email', 'u.studentProfile'])
        .getMany();
      matchedUsers.push(...found);
    }

    for (let i = 0; i < emailList.length; i += 1000) {
      const chunk = emailList.slice(i, i + 1000);
      const found = await this.userRepo
        .createQueryBuilder('u')
        .where('LOWER(u.email) IN (:...emails)', { emails: chunk })
        .select(['u.id', 'u.uid', 'u.name', 'u.email', 'u.studentProfile'])
        .getMany();
      matchedUsers.push(...found);
    }

    // Index matched users by UID and by Email
    const userByUid = new Map<string, User>();
    const userByEmail = new Map<string, User>();
    matchedUsers.forEach((u) => {
      if (u.uid) userByUid.set(u.uid.trim().toUpperCase(), u);
      if (u.email) userByEmail.set(u.email.trim().toLowerCase(), u);
    });

    // Check existing assignments in current schedule
    const userIds = Array.from(new Set(matchedUsers.map((u) => u.id)));
    const existingAssignmentsMap = new Map<string, ExamEligibilityAssignment>();
    if (userIds.length > 0) {
      for (let i = 0; i < userIds.length; i += 1000) {
        const chunk = userIds.slice(i, i + 1000);
        const existing = await this.assignmentRepo.find({
          where: { scheduleId, studentId: In(chunk) },
          relations: { slot: true },
        });
        existing.forEach((a) => existingAssignmentsMap.set(a.studentId, a));
      }
    }

    const matchedStudentsMap = new Map<string, MatchedStudentDto>();
    const unmatchedRecords: UnmatchedRecordDto[] = [];
    const conflictingRecords: ConflictingRecordDto[] = [];

    for (const row of rawInputRows) {
      const cleanUid = row.rawUid?.trim().toUpperCase();
      const cleanEmail = row.rawEmail?.trim().toLowerCase();

      // Case 1: Both UID and Email provided
      if (cleanUid && cleanEmail) {
        const userUidMatch = userByUid.get(cleanUid);
        const userEmailMatch = userByEmail.get(cleanEmail);

        if (userUidMatch && userEmailMatch) {
          if (userUidMatch.id === userEmailMatch.id) {
            const existing = existingAssignmentsMap.get(userUidMatch.id);
            matchedStudentsMap.set(userUidMatch.id, {
              studentId: userUidMatch.id,
              uid: userUidMatch.uid || cleanUid,
              name: userUidMatch.name,
              email: userUidMatch.email,
              department: userUidMatch.studentProfile?.department || '',
              semester: userUidMatch.studentProfile?.semester ?? null,
              section: userUidMatch.studentProfile?.section || '',
              alreadyAssigned: !!existing,
              assignedSlotName: existing?.slot?.name,
            });
          } else {
            // CONFLICT! UID points to one student and Email points to another
            conflictingRecords.push({
              rowNumber: row.rowNumber,
              inputUid: cleanUid,
              inputEmail: cleanEmail,
              uidMatchName: userUidMatch.name,
              emailMatchName: userEmailMatch.name,
              reason: `UID "${cleanUid}" resolves to "${userUidMatch.name}" while Email "${cleanEmail}" resolves to "${userEmailMatch.name}".`,
            });
          }
        } else if (userUidMatch && !userEmailMatch) {
          conflictingRecords.push({
            rowNumber: row.rowNumber,
            inputUid: cleanUid,
            inputEmail: cleanEmail,
            uidMatchName: userUidMatch.name,
            emailMatchName: 'Not Found',
            reason: `UID matched "${userUidMatch.name}", but provided Email "${cleanEmail}" was not found in student database.`,
          });
        } else if (!userUidMatch && userEmailMatch) {
          conflictingRecords.push({
            rowNumber: row.rowNumber,
            inputUid: cleanUid,
            inputEmail: cleanEmail,
            uidMatchName: 'Not Found',
            emailMatchName: userEmailMatch.name,
            reason: `Email matched "${userEmailMatch.name}", but provided UID "${cleanUid}" was not found in student database.`,
          });
        } else {
          unmatchedRecords.push({
            rowNumber: row.rowNumber,
            inputUid: cleanUid,
            inputEmail: cleanEmail,
            reason: 'Neither UID nor Email matched any student in database.',
          });
        }
      } else if (cleanUid) {
        // Case 2: Only UID provided
        const user = userByUid.get(cleanUid);
        if (user) {
          const existing = existingAssignmentsMap.get(user.id);
          matchedStudentsMap.set(user.id, {
            studentId: user.id,
            uid: user.uid || cleanUid,
            name: user.name,
            email: user.email,
            department: user.studentProfile?.department || '',
            semester: user.studentProfile?.semester ?? null,
            section: user.studentProfile?.section || '',
            alreadyAssigned: !!existing,
            assignedSlotName: existing?.slot?.name,
          });
        } else {
          unmatchedRecords.push({
            rowNumber: row.rowNumber,
            inputUid: cleanUid,
            reason: `UID "${cleanUid}" was not found in student database.`,
          });
        }
      } else if (cleanEmail) {
        // Case 3: Only Email provided
        const user = userByEmail.get(cleanEmail);
        if (user) {
          const existing = existingAssignmentsMap.get(user.id);
          matchedStudentsMap.set(user.id, {
            studentId: user.id,
            uid: user.uid || '',
            name: user.name,
            email: user.email,
            department: user.studentProfile?.department || '',
            semester: user.studentProfile?.semester ?? null,
            section: user.studentProfile?.section || '',
            alreadyAssigned: !!existing,
            assignedSlotName: existing?.slot?.name,
          });
        } else {
          unmatchedRecords.push({
            rowNumber: row.rowNumber,
            inputEmail: cleanEmail,
            reason: `Email "${cleanEmail}" was not found in student database.`,
          });
        }
      }
    }

    const matchedStudents = Array.from(matchedStudentsMap.values());
    const alreadyAssignedCount = matchedStudents.filter((s) => s.alreadyAssigned).length;

    const summary: IdentifierMatchSummaryDto = {
      totalInputRows: rawInputRows.length,
      uniqueIdentifiersProcessed: uniqueUidsToFetch.size + uniqueEmailsToFetch.size,
      matchedStudentsCount: matchedStudents.length,
      alreadyAssignedCount,
      duplicateEntriesCount: duplicateRecords.length,
      unmatchedCount: unmatchedRecords.length,
      conflictCount: conflictingRecords.length,
    };

    return {
      summary,
      matchedStudents,
      unmatchedRecords,
      conflictingRecords,
      duplicateRecords,
    };
  }

  private parseTextLinesIntoRows(
    text: string,
    outRows: Array<{ rowNumber: number; rawUid?: string; rawEmail?: string }>,
  ): void {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) return;

    let startIndex = 0;
    const firstLine = lines[0];
    const testDelimiter = firstLine.includes('\t')
      ? '\t'
      : firstLine.includes(',')
      ? ','
      : firstLine.includes(';')
      ? ';'
      : null;
    const tokens = testDelimiter
      ? firstLine.split(testDelimiter).map((h) => h.trim().replace(/^["']|["']$/g, ''))
      : [firstLine.trim().replace(/^["']|["']$/g, '')];

    const isHeaderKeyword = (token: string) =>
      /^(uid|student_?uid|student\s*uid|roll_?no|enrollment_?no|rollno|reg_?no|email|student_?email|student\s*email|mail)$/i.test(
        token.trim(),
      );

    let uidIdx = -1;
    let emailIdx = -1;

    if (tokens.some((t) => isHeaderKeyword(t))) {
      startIndex = 1;
      tokens.forEach((h, idx) => {
        if (/^(uid|student_?uid|student\s*uid|roll_?no|enrollment_?no|rollno|reg_?no)$/i.test(h.trim())) {
          uidIdx = idx;
        }
        if (/^(email|student_?email|student\s*email|mail)$/i.test(h.trim())) {
          emailIdx = idx;
        }
      });
    }

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i];
      const delimiter = line.includes('\t') ? '\t' : line.includes(',') ? ',' : line.includes(';') ? ';' : null;
      let rawUid = '';
      let rawEmail = '';

      if (delimiter) {
        const parts = line.split(delimiter).map((p) => p.trim().replace(/^["']|["']$/g, ''));
        if (uidIdx !== -1) rawUid = parts[uidIdx] || '';
        if (emailIdx !== -1) rawEmail = parts[emailIdx] || '';

        if (uidIdx === -1 && emailIdx === -1) {
          parts.forEach((p) => {
            if (p.includes('@') && p.includes('.')) {
              if (!rawEmail) rawEmail = p;
            } else if (p && !rawUid) {
              rawUid = p;
            }
          });
        }
      } else {
        const val = line.trim();
        if (val.includes('@') && val.includes('.')) {
          rawEmail = val;
        } else {
          rawUid = val;
        }
      }

      if (rawUid || rawEmail) {
        outRows.push({
          rowNumber: i + 1,
          rawUid,
          rawEmail,
        });
      }
    }
  }

  generateImportErrorReportCsv(errors: {
    unmatchedRecords: UnmatchedRecordDto[];
    conflictingRecords: ConflictingRecordDto[];
    duplicateRecords: DuplicateRecordDto[];
  }): string {
    const sanitize = (val?: string) => {
      if (!val) return '""';
      let clean = String(val).trim();
      // Formula injection prevention
      if (/^[=+\-@\t\r]/.test(clean)) {
        clean = `'` + clean;
      }
      return `"${clean.replace(/"/g, '""')}"`;
    };

    const lines: string[] = ['"Row Number","Record Type","Input UID","Input Email","Issue / Reason"'];

    errors.conflictingRecords.forEach((c) => {
      lines.push(
        [
          c.rowNumber,
          sanitize('CONFLICT'),
          sanitize(c.inputUid),
          sanitize(c.inputEmail),
          sanitize(c.reason),
        ].join(','),
      );
    });

    errors.unmatchedRecords.forEach((u) => {
      lines.push(
        [
          u.rowNumber,
          sanitize('UNMATCHED'),
          sanitize(u.inputUid),
          sanitize(u.inputEmail),
          sanitize(u.reason),
        ].join(','),
      );
    });

    errors.duplicateRecords.forEach((d) => {
      lines.push(
        [
          d.rowNumber,
          sanitize('DUPLICATE'),
          sanitize(d.identifier),
          sanitize(''),
          sanitize('Duplicate entry in input dataset'),
        ].join(','),
      );
    });

    return lines.join('\n');
  }

  // =========================================================================
  // HELPER METHODS
  // =========================================================================

  private async refreshScheduleStudentCounts(scheduleId: string): Promise<number> {
    const totalEligible = await this.assignmentRepo.count({ where: { scheduleId } });
    const totalAssigned = await this.assignmentRepo.count({
      where: { scheduleId, slotId: Raw((alias) => `${alias} IS NOT NULL`) },
    });

    await this.scheduleRepo.update(
      { id: scheduleId },
      { totalEligibleStudents: totalEligible, totalAssignedStudents: totalAssigned },
    );

    return totalEligible;
  }

  private shuffle<T>(arr: T[]): T[] {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
}
