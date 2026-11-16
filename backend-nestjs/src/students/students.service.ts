import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, ILike } from 'typeorm';
import { User } from '../database/entities/user.entity';
import { AuditLog } from '../database/entities/audit-log.entity';
import { EmailJob } from '../database/entities/email-job.entity';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import * as xlsx from 'xlsx';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { QueryStudentsDto } from './dto/query-students.dto';
import { encryptTemporaryPassword } from './utils/credential-crypto.util';
import {
  normalizeSectionIdentifier,
  isValidSectionFormat,
} from '../common/constants/sections.constant';

@Injectable()
export class StudentsService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(AuditLog)
    private readonly auditLogRepo: Repository<AuditLog>,
    @InjectRepository(EmailJob)
    private readonly emailJobRepo: Repository<EmailJob>,
    @InjectQueue('credential-email')
    private readonly credentialEmailQueue: Queue,
  ) {}

  private generateSecurePassword(length = 12): string {
    const chars =
      'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*';
    const bytes = crypto.randomBytes(length);
    let pass = '';
    for (let i = 0; i < length; i++) {
      pass += chars[bytes[i] % chars.length];
    }
    return pass + 'A1!';
  }

  async findAll(query: QueryStudentsDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const qb = this.userRepository.createQueryBuilder('student');
    qb.where('(student.isAssessmentStudent = :isAss OR student.uid IS NOT NULL)', {
      isAss: true,
    });

    if (query.search && query.search.trim()) {
      const search = `%${query.search.trim()}%`;
      qb.andWhere(
        '(student.name ILIKE :search OR student.email ILIKE :search OR student.uid ILIKE :search)',
        { search },
      );
    }

    if (query.department && query.department.trim()) {
      qb.andWhere("student.studentProfile->>'department' = :dept", {
        dept: query.department.trim(),
      });
    }

    if (query.batch && query.batch.trim()) {
      qb.andWhere("student.studentProfile->>'batch' = :batch", {
        batch: query.batch.trim(),
      });
    }

    if (query.semester !== undefined && !isNaN(Number(query.semester))) {
      qb.andWhere("(student.studentProfile->>'semester')::int = :sem", {
        sem: Number(query.semester),
      });
    }

    if (query.isActive !== undefined && query.isActive !== '') {
      qb.andWhere('student.isActive = :isActive', {
        isActive: query.isActive === 'true',
      });
    }

    qb.orderBy('student.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    const [students, total] = await qb.getManyAndCount();

    const activeCount = await this.userRepository.count({
      where: { isActive: true },
    });
    const pendingPasswordResetCount = await this.userRepository.count({
      where: { forcePasswordChange: true },
    });

    return {
      students: students.map((s) => {
        const { password, ...rest } = s;
        return { ...rest, _id: s.id };
      }),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
      stats: {
        total,
        active: activeCount,
        pendingPasswordChange: pendingPasswordResetCount,
      },
    };
  }

  async findById(id: string) {
    const student = await this.userRepository.findOne({
      where: [{ id }, { mongoId: id }],
    });
    if (!student) {
      throw new NotFoundException(`Student '${id}' not found`);
    }
    const { password, ...rest } = student;
    return { ...rest, _id: student.id };
  }

  async create(dto: CreateStudentDto, adminUser: any, ip = '', userAgent = '') {
    const formattedUid = dto.uid.toUpperCase().trim();
    const formattedEmail = dto.email.toLowerCase().trim();

    const existingUid = await this.userRepository.findOne({
      where: { uid: formattedUid },
    });
    if (existingUid) {
      throw new ConflictException(
        `Student with UID '${formattedUid}' already exists`,
      );
    }

    const existingEmail = await this.userRepository.findOne({
      where: { email: formattedEmail },
    });
    if (existingEmail) {
      throw new ConflictException(
        `User with email '${formattedEmail}' already exists`,
      );
    }

    const rawPassword = dto.password || this.generateSecurePassword(12);
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(rawPassword, salt);

    const student = this.userRepository.create({
      name: dto.name.trim(),
      email: formattedEmail,
      uid: formattedUid,
      password: hashedPassword,
      role: 'student',
      isAssessmentStudent: true,
      forcePasswordChange:
        dto.forcePasswordChange !== undefined
          ? dto.forcePasswordChange
          : !dto.password,
      isActive: dto.isActive !== undefined ? dto.isActive : true,
      studentProfile: dto.studentProfile || {},
      authProvider: 'local',
    });
    await this.userRepository.save(student);

    // Audit log
    const audit = this.auditLogRepo.create({
      actorId: adminUser?.id || adminUser?._id,
      actorEmail: adminUser?.email || 'admin',
      action: 'CREATE_STUDENT',
      target: student.id,
      targetType: 'User',
      studentId: student.id,
      ipAddress: ip,
      userAgent: userAgent,
      metadata: {
        uid: student.uid,
        email: student.email,
        name: student.name,
      },
    });
    await this.auditLogRepo.save(audit);

    const { password, ...studentJson } = student;
    return {
      student: { ...studentJson, _id: student.id },
      generatedPassword: !dto.password ? rawPassword : null,
      initialPassword: rawPassword,
    };
  }

  async update(
    id: string,
    dto: UpdateStudentDto,
    adminUser: any,
    ip = '',
    userAgent = '',
  ) {
    const student = await this.userRepository.findOne({
      where: [{ id }, { mongoId: id }],
    });
    if (!student) {
      throw new NotFoundException('Student not found');
    }

    if (dto.uid) {
      const formattedUid = dto.uid.toUpperCase().trim();
      if (formattedUid !== student.uid) {
        const existing = await this.userRepository.findOne({
          where: { uid: formattedUid },
        });
        if (existing && existing.id !== student.id) {
          throw new ConflictException(
            `UID '${formattedUid}' is already in use by another user`,
          );
        }
        student.uid = formattedUid;
      }
    }

    if (dto.email) {
      const formattedEmail = dto.email.toLowerCase().trim();
      if (formattedEmail !== student.email) {
        const existing = await this.userRepository.findOne({
          where: { email: formattedEmail },
        });
        if (existing && existing.id !== student.id) {
          throw new ConflictException(
            `Email '${formattedEmail}' is already in use by another user`,
          );
        }
        student.email = formattedEmail;
      }
    }

    if (dto.name !== undefined) student.name = dto.name.trim();
    if (dto.isActive !== undefined) student.isActive = dto.isActive;
    if (dto.forcePasswordChange !== undefined)
      student.forcePasswordChange = dto.forcePasswordChange;

    if (dto.studentProfile) {
      student.studentProfile = {
        ...(student.studentProfile || {}),
        ...dto.studentProfile,
      };
    }

    await this.userRepository.save(student);

    const audit = this.auditLogRepo.create({
      actorId: adminUser?.id || adminUser?._id,
      actorEmail: adminUser?.email || 'admin',
      action: 'UPDATE_STUDENT',
      target: student.id,
      targetType: 'User',
      studentId: student.id,
      ipAddress: ip,
      userAgent: userAgent,
      metadata: {
        uid: student.uid,
        email: student.email,
        updates: dto,
      },
    });
    await this.auditLogRepo.save(audit);

    const { password, ...studentJson } = student;
    return { ...studentJson, _id: student.id };
  }

  async setActiveStatus(
    id: string,
    isActive: boolean,
    adminUser: any,
    ip = '',
    userAgent = '',
  ) {
    const student = await this.userRepository.findOne({
      where: [{ id }, { mongoId: id }],
    });
    if (!student) {
      throw new NotFoundException('Student not found');
    }

    student.isActive = isActive;
    await this.userRepository.save(student);

    const audit = this.auditLogRepo.create({
      actorId: adminUser?.id || adminUser?._id,
      actorEmail: adminUser?.email || 'admin',
      action: isActive ? 'ACTIVATE_STUDENT' : 'DEACTIVATE_STUDENT',
      target: student.id,
      targetType: 'User',
      studentId: student.id,
      ipAddress: ip,
      userAgent: userAgent,
      metadata: {
        uid: student.uid,
        email: student.email,
        isActive,
      },
    });
    await this.auditLogRepo.save(audit);

    return {
      message: `Student successfully ${isActive ? 'activated' : 'deactivated'}`,
      studentId: student.id,
      isActive: student.isActive,
    };
  }

  async resetPassword(id: string, adminUser: any, ip = '', userAgent = '') {
    const student = await this.userRepository.findOne({
      where: [{ id }, { mongoId: id }],
    });
    if (!student) {
      throw new NotFoundException('Student not found');
    }

    const tempPassword = this.generateSecurePassword(10);
    const salt = await bcrypt.genSalt(10);
    student.password = await bcrypt.hash(tempPassword, salt);
    student.forcePasswordChange = true;
    student.tokenVersion = (student.tokenVersion || 0) + 1;
    await this.userRepository.save(student);

    const audit = this.auditLogRepo.create({
      actorId: adminUser?.id || adminUser?._id,
      actorEmail: adminUser?.email || 'admin',
      action: 'RESET_PASSWORD',
      target: student.id,
      targetType: 'User',
      studentId: student.id,
      ipAddress: ip,
      userAgent: userAgent,
      metadata: {
        uid: student.uid,
        email: student.email,
        forcePasswordChange: true,
      },
    });
    await this.auditLogRepo.save(audit);

    return {
      message: 'Student password successfully reset. Credential email queued.',
      uid: student.uid,
      email: student.email,
      name: student.name,
      forcePasswordChange: true,
      temporaryPassword: tempPassword,
      generatedPassword: tempPassword,
    };
  }

  async parseAndValidateImport(
    fileBuffer: Buffer,
    defaultOptions?: {
      defaultBatch?: string;
      defaultDepartment?: string;
      defaultCourse?: string;
      defaultSemester?: number;
      defaultSection?: string;
      defaultGroup?: string;
      defaultYear?: number;
      defaultUniversity?: string;
      sheetName?: string;
    },
    requireSheetSelection = false,
  ) {
    let workbook: xlsx.WorkBook;
    try {
      workbook = xlsx.read(fileBuffer, {
        type: 'buffer',
        cellFormula: false,
        cellHTML: false,
        cellNF: false,
        cellStyles: false,
        sheetStubs: false,
        raw: true,
        dense: true,
      });
    } catch (e: any) {
      throw new BadRequestException(
        'Unable to parse spreadsheet file: ' + e.message,
      );
    }

    const sheetNames = (workbook.SheetNames || []).filter(
      (s) => s && !['__proto__', 'constructor', 'prototype'].includes(s.trim().toLowerCase()),
    );
    if (!sheetNames.length) {
      throw new BadRequestException(
        'The uploaded spreadsheet contains no valid sheets',
      );
    }

    const selectedSheet = defaultOptions?.sheetName || (!requireSheetSelection || sheetNames.length === 1 ? sheetNames[0] : null);
    if (selectedSheet && ['__proto__', 'constructor', 'prototype'].includes(selectedSheet.trim().toLowerCase())) {
      throw new BadRequestException('Disallowed worksheet name');
    }
    if (selectedSheet && !sheetNames.includes(selectedSheet)) {
      throw new BadRequestException('Selected worksheet does not exist in the uploaded file');
    }
    if (!selectedSheet) {
      return {
        sheetNames,
        selectedSheet: null,
        total: 0,
        valid: 0,
        invalid: 0,
        duplicates: 0,
        errors: [],
        previewRows: [],
        validRows: [],
      };
    }

    const rawParsed = xlsx.utils.sheet_to_json<Record<string, any>>(
      workbook.Sheets[selectedSheet],
      { defval: '' },
    );

    if (!rawParsed || rawParsed.length === 0) {
      throw new BadRequestException('Uploaded sheet is empty');
    }

    if (rawParsed.length > 1000) {
      throw new BadRequestException(
        'Uploaded spreadsheet exceeds maximum allowed limit of 1,000 rows',
      );
    }

    // Deep sanitize rows against Prototype Pollution (CVE-2023-30533, CVE-2024-22363)
    const rawRows = rawParsed.map((row) => {
      const clean: Record<string, any> = {};
      for (const [key, val] of Object.entries(row)) {
        const lowerKey = key.trim().toLowerCase();
        if (
          lowerKey === '__proto__' ||
          lowerKey === 'constructor' ||
          lowerKey === 'prototype'
        ) {
          continue;
        }
        clean[key] = typeof val === 'string' && val.length > 5000 ? val.slice(0, 5000) : val;
      }
      return clean;
    });

    const normalizeHeader = (value: string) => value.trim().toLowerCase().replace(/[\s\-_.]/g, '');
    const findField = (row: Record<string, any>, aliases: string[]): string => {
      const rowKeys = Object.keys(row);
      for (const alias of aliases) {
        const foundKey = rowKeys.find(
          (k) => normalizeHeader(k) === normalizeHeader(alias),
        );
        if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null) {
          return String(row[foundKey]).trim();
        }
      }
      return '';
    };

    const parsedRows: any[] = [];
    const fileUidMap = new Set<string>();
    const fileEmailMap = new Set<string>();

    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];
      const uid = findField(row, [
        'uid',
        'roll_no',
        'rollno',
        'roll number',
        'roll no',
        'student_id',
        'studentid',
        'registration_no',
        'reg_no',
        'id',
      ]).toUpperCase();

      const name = findField(row, [
        'name',
        'student_name',
        'student name',
        'full_name',
        'fullname',
      ]);

      const email = findField(row, [
        'email',
        'student_email',
        'student email',
        'email_address',
        'email id',
        'mail',
      ]).toLowerCase();

      const mobile = findField(row, [
        'mobile',
        'phone',
        'mobile_number',
        'phone_number',
        'contact',
        'contact_number',
        'contact no',
        'mobile_no',
        'phoneno',
      ]);

      const department =
        findField(row, ['department', 'dept', 'branch']) ||
        defaultOptions?.defaultDepartment ||
        '';
      const course =
        findField(row, ['course', 'degree', 'program']) ||
        defaultOptions?.defaultCourse ||
        '';
      const batch =
        findField(row, ['batch', 'year_of_study']) ||
        defaultOptions?.defaultBatch ||
        '';
      const rawSection =
        findField(row, ['section', 'sec']) ||
        defaultOptions?.defaultSection ||
        '';
      const section = normalizeSectionIdentifier(rawSection);
      const group =
        findField(row, ['group', 'grp']) ||
        defaultOptions?.defaultGroup ||
        '';
      const university =
        findField(row, [
          'university',
          'college',
          'institution',
        ]) ||
        defaultOptions?.defaultUniversity ||
        '';

      const rawSem = findField(row, ['semester', 'sem']);
      // University sheets commonly write ordinal semesters such as "5th".
      // Keep invalid values as NaN so the existing row validation reports them.
      const semester = rawSem
        ? Number(rawSem.replace(/(?:st|nd|rd|th)$/i, '').trim())
        : defaultOptions?.defaultSemester || 1;

      const rawYear = findField(row, ['year', 'grad_year', 'graduation_year']);
      const parsedYear = rawYear ? Number(rawYear) : NaN;
      const year = !isNaN(parsedYear)
        ? parsedYear
        : defaultOptions?.defaultYear || new Date().getFullYear();

      const password = findField(row, [
        'password',
        'temp_password',
        'temporary_password',
        'pass',
      ]);

      parsedRows.push({
        rowNumber: i + 2,
        uid,
        name,
        email,
        mobile,
        department,
        course,
        batch,
        section,
        group,
        university,
        semester,
        year,
        password: password || undefined,
      });
    }

    const allFileUids = parsedRows.map((r) => r.uid).filter(Boolean);
    const allFileEmails = parsedRows.map((r) => r.email).filter(Boolean);

    const [existingUsersByUid, existingUsersByEmail] = await Promise.all([
      allFileUids.length > 0
        ? this.userRepository.find({
            where: { uid: In(allFileUids) },
            select: { uid: true },
          })
        : [],
      allFileEmails.length > 0
        ? this.userRepository.find({
            where: { email: In(allFileEmails) },
            select: { email: true },
          })
        : [],
    ]);

    const existingUidSet = new Set(existingUsersByUid.map((u) => u.uid?.toUpperCase()));
    const existingEmailSet = new Set(
      existingUsersByEmail.map((u) => u.email.toLowerCase()),
    );

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const errors: {
      row: number;
      uid?: string;
      email?: string;
      error: string;
      isDuplicate?: boolean;
    }[] = [];
    const validRows: any[] = [];
    let duplicates = 0;
    let invalid = 0;

    for (const row of parsedRows) {
      const rowErrors: string[] = [];
      let rowIsDuplicate = false;

      if (!row.uid) {
        rowErrors.push('UID / Student ID is missing');
      } else if (!/^[A-Za-z0-9_\-\.]{2,32}$/.test(row.uid)) {
        rowErrors.push(
          `Invalid UID format '${row.uid}' (must be 2-32 alphanumeric characters)`,
        );
      } else if (fileUidMap.has(row.uid)) {
        rowErrors.push(`Duplicate UID '${row.uid}' within the uploaded file`);
        rowIsDuplicate = true;
      } else if (existingUidSet.has(row.uid)) {
        rowErrors.push(`UID '${row.uid}' already exists in database`);
        rowIsDuplicate = true;
      }

      if (!row.name) {
        rowErrors.push('Student name is missing');
      }

      if (!row.batch) {
        rowErrors.push('Batch/class is missing (set in sheet or choose a default batch)');
      }

      if (!Number.isInteger(row.year) || row.year < 1990 || row.year > 2100) {
        rowErrors.push('Graduation year is missing or invalid');
      }

      if (
        !Number.isInteger(row.semester) ||
        row.semester < 1 ||
        row.semester > 12
      ) {
        rowErrors.push('Semester must be a number between 1 and 12');
      }

      if (row.section && !isValidSectionFormat(row.section)) {
        rowErrors.push(
          `Invalid section '${row.section}' (must be a valid section identifier such as A1, B4)`,
        );
      }

      if (!row.email) {
        rowErrors.push('Email is missing');
      } else if (!emailRegex.test(row.email)) {
        rowErrors.push(`Invalid email format '${row.email}'`);
      } else if (fileEmailMap.has(row.email)) {
        rowErrors.push(
          `Duplicate email '${row.email}' within the uploaded file`,
        );
        rowIsDuplicate = true;
      } else if (existingEmailSet.has(row.email)) {
        rowErrors.push(`Email '${row.email}' already exists in database`);
        rowIsDuplicate = true;
      }

      if (row.mobile) {
        const cleanMobile = String(row.mobile).replace(/[\s\-().]/g, '');
        if (!/^\+?[0-9]{10,15}$/.test(cleanMobile)) {
          rowErrors.push(
            `Invalid mobile number '${row.mobile}' (must be 10-15 digits)`,
          );
        }
      }

      if (row.uid) fileUidMap.add(row.uid);
      if (row.email) fileEmailMap.add(row.email);

      if (rowErrors.length > 0) {
        if (rowIsDuplicate) duplicates++;
        else invalid++;

        errors.push({
          row: row.rowNumber,
          uid: row.uid,
          email: row.email,
          error: rowErrors.join('; '),
          isDuplicate: rowIsDuplicate,
        });
      } else {
        validRows.push(row);
      }
    }

    return {
      sheetNames,
      selectedSheet,
      total: parsedRows.length,
      valid: validRows.length,
      invalid,
      duplicates,
      errors,
      previewRows: parsedRows.slice(0, 50),
      validRows,
    };
  }

  async confirmImport(
    validRows: any[],
    adminUser: any,
    ip = '',
    userAgent = '',
    defaultOptions?: any,
  ) {
    if (!validRows || validRows.length === 0) {
      throw new BadRequestException('No valid rows provided for import');
    }

    if (validRows.length > 500) {
      throw new BadRequestException(
        'Batch import exceeds maximum allowed limit of 500 students per batch',
      );
    }

    const uids = [...new Set(validRows.map((r) => String(r.uid || '').toUpperCase().trim()))].filter(Boolean);
    const emails = [...new Set(validRows.map((r) => String(r.email || '').toLowerCase().trim()))].filter(Boolean);

    // Dynamic duplicate verification at confirm time
    const [dupUids, dupEmails] = await Promise.all([
      uids.length > 0
        ? this.userRepository.find({
            where: { uid: In(uids) },
            select: { uid: true },
          })
        : [],
      emails.length > 0
        ? this.userRepository.find({
            where: { email: In(emails) },
            select: { email: true },
          })
        : [],
    ]);

    const existingUidSet = new Set(dupUids.map((u) => u.uid?.toUpperCase()));
    const existingEmailSet = new Set(dupEmails.map((u) => u.email.toLowerCase()));

    const rowsToInsert: any[] = [];
    const skippedDuplicates: Array<{
      rowNumber: number;
      uid: string;
      email: string;
      name: string;
      reason: string;
    }> = [];
    const seenBatchUids = new Set<string>();
    const seenBatchEmails = new Set<string>();

    for (const row of validRows) {
      const rowUid = String(row.uid || '').toUpperCase().trim();
      const rowEmail = String(row.email || '').toLowerCase().trim();

      if (!rowUid || !rowEmail) continue;

      if (existingUidSet.has(rowUid)) {
        skippedDuplicates.push({
          rowNumber: row.rowNumber,
          uid: rowUid,
          email: rowEmail,
          name: row.name,
          reason: `Student UID '${rowUid}' already exists in database`,
        });
        continue;
      }

      if (existingEmailSet.has(rowEmail)) {
        skippedDuplicates.push({
          rowNumber: row.rowNumber,
          uid: rowUid,
          email: rowEmail,
          name: row.name,
          reason: `Email '${rowEmail}' already exists in database`,
        });
        continue;
      }

      if (seenBatchUids.has(rowUid) || seenBatchEmails.has(rowEmail)) {
        skippedDuplicates.push({
          rowNumber: row.rowNumber,
          uid: rowUid,
          email: rowEmail,
          name: row.name,
          reason: `Duplicate UID or Email within import payload`,
        });
        continue;
      }

      seenBatchUids.add(rowUid);
      seenBatchEmails.add(rowEmail);
      rowsToInsert.push(row);
    }

    const salt = await bcrypt.genSalt(10);
    const usersToInsert: User[] = [];
    const emailJobsToInsert: EmailJob[] = [];

    // Process bcrypt hashing with bounded concurrency (5 per batch) to fully utilize
    // libuv threadpool without starvation or request timeouts (ISSUE-PRF-002)
    const HASH_BATCH_SIZE = 5;
    for (let i = 0; i < rowsToInsert.length; i += HASH_BATCH_SIZE) {
      const chunk = rowsToInsert.slice(i, i + HASH_BATCH_SIZE);
      const hashedChunk = await Promise.all(
        chunk.map(async (row) => {
          const rawPassword =
            row.password && String(row.password).trim()
              ? String(row.password).trim()
              : this.generateSecurePassword(12);
          const hashedPassword = await bcrypt.hash(rawPassword, salt);
          return { row, rawPassword, hashedPassword };
        }),
      );

      for (const { row, rawPassword, hashedPassword } of hashedChunk) {
        const cleanMobile = row.mobile
          ? String(row.mobile).replace(/[\s\-().]/g, '')
          : '';

        const u = this.userRepository.create({
          name: String(row.name).trim(),
          email: String(row.email).toLowerCase().trim(),
          uid: String(row.uid).toUpperCase().trim(),
          password: hashedPassword,
          role: 'student',
          isAssessmentStudent: true,
          forcePasswordChange: true,
          isActive: true,
          authProvider: 'local',
          studentProfile: {
            university:
              row.university || defaultOptions?.defaultUniversity || '',
            department:
              row.department || defaultOptions?.defaultDepartment || '',
            course: row.course || defaultOptions?.defaultCourse || '',
            semester:
              row.semester || defaultOptions?.defaultSemester || 1,
            section: normalizeSectionIdentifier(
              row.section || defaultOptions?.defaultSection || '',
            ),
            group: row.group || defaultOptions?.defaultGroup || '',
            batch: row.batch || defaultOptions?.defaultBatch || '',
            year:
              row.year ||
              defaultOptions?.defaultYear ||
              new Date().getFullYear(),
            ...(cleanMobile
              ? { mobile: cleanMobile, phone: cleanMobile }
              : {}),
          },
        });
        usersToInsert.push(u);

        const job = this.emailJobRepo.create({
          uid: u.uid,
          email: u.email,
          name: u.name,
          temporaryPassword: encryptTemporaryPassword(rawPassword),
          status: 'pending',
          retryCount: 0,
          createdBy: adminUser?.id || adminUser?._id,
        });
        emailJobsToInsert.push(job);
      }
    }

    // Process inserts inside a database transaction for complete data integrity
    if (usersToInsert.length > 0) {
      await this.userRepository.manager.transaction(async (manager) => {
        const chunkSize = 500;
        const savedUsers: User[] = [];
        for (let i = 0; i < usersToInsert.length; i += chunkSize) {
          const chunk = usersToInsert.slice(i, i + chunkSize);
          const savedChunk = await manager.save(chunk);
          savedUsers.push(...savedChunk);
        }

        // Link generated student IDs to their corresponding email jobs
        for (let i = 0; i < emailJobsToInsert.length; i++) {
          if (savedUsers[i]?.id) {
            emailJobsToInsert[i].student_id = savedUsers[i].id;
            emailJobsToInsert[i].student = savedUsers[i];
          }
        }

        for (let i = 0; i < emailJobsToInsert.length; i += chunkSize) {
          const chunk = emailJobsToInsert.slice(i, i + chunkSize);
          await manager.save(chunk);
        }
      });
    }

    const audit = this.auditLogRepo.create({
      actorId: adminUser?.id || adminUser?._id,
      actorEmail: adminUser?.email || 'admin',
      action: 'IMPORT_STUDENTS',
      targetType: 'User',
      ipAddress: ip,
      userAgent: userAgent,
      metadata: {
        totalSubmitted: validRows.length,
        importedCount: usersToInsert.length,
        skippedDuplicatesCount: skippedDuplicates.length,
        emailJobsCreated: emailJobsToInsert.length,
      },
    });
    await this.auditLogRepo.save(audit);

    return {
      success: true,
      message: `Successfully imported ${usersToInsert.length} students. Skipped ${skippedDuplicates.length} existing duplicate records.`,
      importedCount: usersToInsert.length,
      skippedCount: skippedDuplicates.length,
      skippedDuplicates,
      emailJobsCreated: emailJobsToInsert.length,
      totalSubmitted: validRows.length,
    };
  }

  async sendCredentials(jobIds?: string[], portalUrl?: string) {
    const where: any = jobIds && jobIds.length > 0 ? { id: In(jobIds) } : { status: 'pending' };

    const pendingJobs = await this.emailJobRepo.find({ where });
    if (!pendingJobs || pendingJobs.length === 0) {
      return {
        enqueuedCount: 0,
        message: 'No eligible credential email jobs found.',
      };
    }

    for (const job of pendingJobs) {
      job.status = 'queued';
      await this.emailJobRepo.save(job);

      await this.credentialEmailQueue.add(
        'send-credential',
        {
          emailJobId: job.id,
          portalUrl,
        },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          removeOnComplete: 1000,
        },
      );
    }

    return {
      enqueuedCount: pendingJobs.length,
      message: `Enqueued ${pendingJobs.length} credential emails for delivery.`,
    };
  }

  async sendIndividualCredential(studentId: string, portalUrl?: string) {
    if (!studentId || studentId === 'undefined') {
      throw new BadRequestException('A valid student ID is required');
    }
    let student = await this.userRepository.findOne({
      where: [{ id: studentId }, { mongoId: studentId }, { uid: studentId }],
    });
    let emailJob: EmailJob | null = null;
    if (!student) {
      emailJob = await this.emailJobRepo.findOne({ where: { id: studentId } });
      if (emailJob && emailJob.student_id) {
        student = await this.userRepository.findOne({
          where: { id: emailJob.student_id },
        });
      }
    }
    if (!student) throw new NotFoundException('Student not found');

    if (!emailJob) {
      emailJob = await this.emailJobRepo.findOne({
        where: { uid: student.uid },
        order: { createdAt: 'DESC' },
      });
    }

    if (!emailJob || !emailJob.temporaryPassword) {
      const tempPass = this.generateSecurePassword(12);
      const salt = await bcrypt.genSalt(10);
      student.password = await bcrypt.hash(tempPass, salt);
      student.forcePasswordChange = true;
      await this.userRepository.save(student);

      emailJob = this.emailJobRepo.create({
        student: { id: student.id } as any,
        student_id: student.id,
        uid: student.uid,
        email: student.email,
        name: student.name,
        temporaryPassword: encryptTemporaryPassword(tempPass),
        status: 'queued',
        retryCount: 0,
      });
      await this.emailJobRepo.save(emailJob);
    } else {
      emailJob.status = 'queued';
      await this.emailJobRepo.save(emailJob);
    }

    await this.credentialEmailQueue.add(
      'send-credential',
      {
        emailJobId: emailJob.id,
        portalUrl,
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      },
    );

    return {
      success: true,
      message: `Credential email enqueued for ${student.name} (${student.uid})`,
      jobId: emailJob.id,
    };
  }

  async retryFailedCredentials(portalUrl?: string) {
    const failedJobs = await this.emailJobRepo.find({ where: { status: 'failed' } });
    if (!failedJobs || failedJobs.length === 0) {
      return {
        retriedCount: 0,
        message: 'No failed credential email jobs found.',
      };
    }

    for (const job of failedJobs) {
      job.status = 'queued';
      await this.emailJobRepo.save(job);

      await this.credentialEmailQueue.add(
        'send-credential',
        {
          emailJobId: job.id,
          portalUrl,
        },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        },
      );
    }

    return {
      retriedCount: failedJobs.length,
      message: `Re-enqueued ${failedJobs.length} failed credential emails for processing.`,
    };
  }

  async getEmailStatus(page = 1, limit = 20, status?: string) {
    const skip = (Math.max(1, page) - 1) * limit;
    const where: any = status && status !== 'all' ? { status } : {};

    const [
      total,
      pending,
      queued,
      sent,
      failed,
      retrying,
      jobs,
      filteredTotal,
    ] = await Promise.all([
      this.emailJobRepo.count(),
      this.emailJobRepo.count({ where: { status: 'pending' } }),
      this.emailJobRepo.count({ where: { status: 'queued' } }),
      this.emailJobRepo.count({ where: { status: 'sent' } }),
      this.emailJobRepo.count({ where: { status: 'failed' } }),
      this.emailJobRepo.count({ where: { status: 'retrying' } }),
      this.emailJobRepo.find({
        where,
        order: { updatedAt: 'DESC', createdAt: 'DESC' },
        skip,
        take: limit,
      }),
      this.emailJobRepo.count({ where }),
    ]);

    return {
      stats: {
        total,
        pending,
        queued,
        sent,
        failed,
        retrying,
      },
      jobs: jobs.map((j) => ({
        id: j.id,
        _id: j.id,
        studentId: j.student_id,
        uid: j.uid,
        email: j.email,
        name: j.name,
        status: j.status,
        retryCount: j.retryCount,
        sentAt: j.sentAt,
        error: j.error,
        createdAt: j.createdAt,
        updatedAt: j.updatedAt,
      })),
      pagination: {
        page,
        limit,
        total: filteredTotal,
        totalPages: Math.ceil(filteredTotal / limit) || 1,
      },
    };
  }
}
