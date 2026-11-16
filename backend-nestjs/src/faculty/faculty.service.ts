import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Not } from 'typeorm';
import { FacultyAssignment } from '../database/entities/faculty-assignment.entity';
import { Assessment } from '../database/entities/assessment.entity';
import { AssessmentAttempt } from '../database/entities/assessment-attempt.entity';
import { Question } from '../database/entities/question.entity';
import { Batch } from '../database/entities/batch.entity';
import { StudentEnrollment } from '../database/entities/student-enrollment.entity';
import { User } from '../database/entities/user.entity';
import { S3Service } from '../s3/s3.service';
import { ReviewAttemptDto } from './dto/review-attempt.dto';

@Injectable()
export class FacultyService {
  constructor(
    @InjectRepository(FacultyAssignment)
    private readonly facultyAssignmentRepo: Repository<FacultyAssignment>,
    @InjectRepository(Assessment)
    private readonly assessmentRepo: Repository<Assessment>,
    @InjectRepository(AssessmentAttempt)
    private readonly attemptRepo: Repository<AssessmentAttempt>,
    @InjectRepository(Question)
    private readonly questionRepo: Repository<Question>,
    @InjectRepository(Batch)
    private readonly batchRepo: Repository<Batch>,
    @InjectRepository(StudentEnrollment)
    private readonly enrollmentRepo: Repository<StudentEnrollment>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly s3Service: S3Service,
  ) {}

  async getDashboardStats(user: any) {
    const userId = user?.id || user?._id;

    const [
      myAssessmentsCount,
      activeAssessmentsCount,
      myQuestionsCount,
      assignments,
      recentAssessments,
    ] = await Promise.all([
      this.assessmentRepo.count({
        where: {
          created_by_id: userId,
          status: Not('archived'),
        },
      }),
      this.assessmentRepo.count({
        where: {
          created_by_id: userId,
          status: In(['published', 'ongoing', 'active']),
        },
      }),
      this.questionRepo.count({
        where: {
          created_by_id: userId,
          status: Not('archived'),
        },
      }),
      this.facultyAssignmentRepo.find({
        where: { faculty_id: userId },
      }),
      this.assessmentRepo.find({
        where: {
          created_by_id: userId,
          status: Not('archived'),
        },
        order: { createdAt: 'DESC' },
        take: 5,
      }),
    ]);

    const assignedBatchIds = Array.from(
      new Set(assignments.map((a) => a.batch_id).filter(Boolean)),
    );
    const assignedBatchesCount = assignedBatchIds.length;

    let assignedStudentsCount = 0;
    if (assignedBatchIds.length > 0) {
      assignedStudentsCount = await this.enrollmentRepo
        .createQueryBuilder('enrollment')
        .where('enrollment.batch_id IN (:...assignedBatchIds)', {
          assignedBatchIds,
        })
        .andWhere('enrollment.isActive = true')
        .select('COUNT(DISTINCT enrollment.student_id)', 'count')
        .getRawOne()
        .then((res) => parseInt(res?.count, 10) || 0)
        .catch(() => 0);
    }

    // Recent attempts on assessments authored by this faculty member
    let recentAttempts: any[] = [];
    if (recentAssessments.length > 0) {
      const assessmentIds = recentAssessments.map((a) => a.id);
      recentAttempts = await this.attemptRepo.find({
        where: { assessmentId: In(assessmentIds) },
        order: { startedAt: 'DESC' },
        take: 6,
        relations: { assessment: true },
      });
    }

    return {
      success: true,
      stats: {
        myAssessmentsCount,
        activeAssessmentsCount,
        myQuestionsCount,
        assignedBatchesCount,
        assignedStudentsCount,
      },
      recentAssessments: recentAssessments.map((a) => ({
        id: a.id,
        _id: a.id,
        title: a.title,
        code: a.code,
        status: a.status,
        durationMinutes: a.durationMinutes,
        totalMarks: a.totalMarks,
        createdAt: a.createdAt,
      })),
      recentAttempts: recentAttempts.map((att) => ({
        id: att.id,
        _id: att.id,
        assessmentTitle: att.assessment?.title || 'Assessment',
        studentName: att.studentName,
        studentUid: att.studentUid,
        score: att.score,
        maxScore: att.maxScore,
        passed: att.passed,
        status: att.status,
        submittedAt: att.submittedAt,
        startedAt: att.startedAt,
      })),
    };
  }

  async getMyAssessments(user: any) {
    const userId = user?.id || user?._id;

    const assessments = await this.assessmentRepo.find({
      where: {
        created_by_id: userId,
        status: Not('archived'),
      },
      order: { createdAt: 'DESC' },
    });

    if (assessments.length === 0) {
      return { success: true, assessments: [] };
    }

    const assessmentIds = assessments.map((a) => a.id);
    const attempts = await this.attemptRepo.find({
      where: { assessmentId: In(assessmentIds) },
      select: {
        id: true,
        assessmentId: true,
        score: true,
        passed: true,
        status: true,
        violations: true,
      },
    });

    const statsByAssessment = new Map<
      string,
      {
        totalAttempts: number;
        passedAttempts: number;
        totalScore: number;
        flaggedAttempts: number;
      }
    >();

    attempts.forEach((att) => {
      const key = att.assessmentId;
      if (!statsByAssessment.has(key)) {
        statsByAssessment.set(key, {
          totalAttempts: 0,
          passedAttempts: 0,
          totalScore: 0,
          flaggedAttempts: 0,
        });
      }
      const st = statsByAssessment.get(key)!;
      st.totalAttempts += 1;
      if (att.passed) st.passedAttempts += 1;
      st.totalScore += att.score || 0;
      if (Array.isArray(att.violations) && att.violations.length > 0) {
        st.flaggedAttempts += 1;
      }
    });

    const enriched = assessments.map((a) => {
      const st = statsByAssessment.get(a.id) || {
        totalAttempts: 0,
        passedAttempts: 0,
        totalScore: 0,
        flaggedAttempts: 0,
      };
      const avgScore =
        st.totalAttempts > 0
          ? Math.round((st.totalScore / st.totalAttempts) * 10) / 10
          : 0;

      return {
        ...a,
        _id: a.id,
        totalAttempts: st.totalAttempts,
        passedAttempts: st.passedAttempts,
        avgScore,
        flaggedAttempts: st.flaggedAttempts,
      };
    });

    return {
      success: true,
      assessments: enriched,
      count: enriched.length,
    };
  }

  async getAssignedBatches(user: any) {
    const userId = user?.id || user?._id;

    const assignments = await this.facultyAssignmentRepo.find({
      where: { faculty_id: userId },
      relations: { batch: true },
      order: { createdAt: 'DESC' },
    });

    const batchIds = Array.from(
      new Set(assignments.map((a) => a.batch_id).filter(Boolean)),
    );

    const countsByBatch = new Map<string, number>();
    if (batchIds.length > 0) {
      const counts = await this.enrollmentRepo
        .createQueryBuilder('enrollment')
        .where('enrollment.batch_id IN (:...batchIds)', { batchIds })
        .andWhere('enrollment.isActive = true')
        .select('enrollment.batch_id', 'batchId')
        .addSelect('COUNT(DISTINCT enrollment.student_id)', 'count')
        .groupBy('enrollment.batch_id')
        .getRawMany();

      counts.forEach((c) => {
        countsByBatch.set(c.batchId, parseInt(c.count, 10) || 0);
      });
    }

    const result = assignments.map((a) => ({
      assignmentId: a.id,
      batchId: a.batch_id,
      batchName: a.batch?.name || '',
      department: a.batch?.department || '',
      graduationYear: a.batch?.graduationYear,
      courseCode: a.courseCode,
      section: a.section || null,
      studentCount: countsByBatch.get(a.batch_id) || 0,
      createdAt: a.createdAt,
    }));

    return {
      success: true,
      batches: result,
      count: result.length,
    };
  }

  async getAssignedStudents(
    user: any,
    query: {
      batchId?: string;
      search?: string;
      page?: number | string;
      limit?: number | string;
    } = {},
  ) {
    const userId = user?.id || user?._id;

    const assignments = await this.facultyAssignmentRepo.find({
      where: { faculty_id: userId },
    });

    const allBatchIds = Array.from(
      new Set(assignments.map((a) => a.batch_id).filter(Boolean)),
    );

    if (allBatchIds.length === 0) {
      return {
        success: true,
        students: [],
        total: 0,
        page: 1,
        pages: 0,
      };
    }

    let targetBatchIds = allBatchIds;
    if (query.batchId && query.batchId !== 'all') {
      targetBatchIds = allBatchIds.filter((id) => id === query.batchId);
      if (targetBatchIds.length === 0) {
        return {
          success: true,
          students: [],
          total: 0,
          page: 1,
          pages: 0,
        };
      }
    }

    const page = Math.max(1, parseInt(String(query.page), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(query.limit), 10) || 20));
    const skip = (page - 1) * limit;

    const qb = this.enrollmentRepo
      .createQueryBuilder('enrollment')
      .leftJoinAndSelect('enrollment.student', 'student')
      .leftJoinAndSelect('enrollment.batch', 'batch')
      .where('enrollment.batch_id IN (:...targetBatchIds)', { targetBatchIds })
      .andWhere('enrollment.isActive = true');

    if (query.search && query.search.trim()) {
      const s = `%${query.search.trim()}%`;
      qb.andWhere(
        '(student.name ILIKE :s OR student.email ILIKE :s OR enrollment.rollNumber ILIKE :s)',
        { s },
      );
    }

    qb.orderBy('batch.name', 'ASC')
      .addOrderBy('enrollment.rollNumber', 'ASC')
      .addOrderBy('student.name', 'ASC')
      .skip(skip)
      .take(limit);

    const [enrollments, total] = await qb.getManyAndCount();

    const students = enrollments.map((en) => {
      const { password, mfaSecret, ...safeStudent } = (en.student || {}) as any;
      const assignmentForBatch = assignments.find((a) => a.batch_id === en.batch_id);

      return {
        id: en.id,
        enrollmentId: en.id,
        studentId: en.student_id,
        name: safeStudent.name || 'Student',
        email: safeStudent.email || '',
        avatar: safeStudent.avatar || null,
        rollNumber: en.rollNumber || '',
        batchId: en.batch_id,
        batchName: en.batch?.name || '',
        department: en.batch?.department || '',
        graduationYear: en.batch?.graduationYear,
        courseCode: assignmentForBatch?.courseCode || '',
        section: assignmentForBatch?.section || null,
        joinedAt: en.createdAt,
      };
    });

    return {
      success: true,
      students,
      total,
      page,
      pages: Math.ceil(total / limit),
    };
  }

  async getAttemptSnapshots(
    assessmentId: string,
    attemptId: string,
    user: any,
  ) {
    const userId = user?.id || user?._id;

    const assessment = await this.assessmentRepo.findOne({
      where: [{ id: assessmentId }, { mongoId: assessmentId }],
    });
    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }

    const isAdmin =
      user && ['admin', 'super_admin'].includes(user.role);
    if (!isAdmin && assessment.created_by_id !== userId) {
      throw new ForbiddenException(
        'You are not authorized to view snapshots for this assessment',
      );
    }

    const attempt = await this.attemptRepo.findOne({
      where: { id: attemptId },
    });
    if (!attempt) {
      throw new NotFoundException('Assessment attempt not found');
    }

    if (
      attempt.assessmentId !== assessment.id &&
      attempt.assessmentId !== assessmentId
    ) {
      throw new BadRequestException('Attempt does not belong to this assessment');
    }

    const rawCaptures = Array.isArray(attempt.captures) ? attempt.captures : [];

    const snapshots = await Promise.all(
      rawCaptures.map(async (cap: any) => {
        let presignedUrl = cap.url;
        try {
          if (cap.url && typeof cap.url === 'string') {
            presignedUrl = await this.s3Service.getPresignedUrl(cap.url, 300);
          }
        } catch {
          presignedUrl = cap.url;
        }

        return {
          type: cap.type || 'snapshot',
          url: presignedUrl,
          timestamp: cap.timestamp || new Date(),
          filename: cap.filename || '',
        };
      }),
    );

    return {
      success: true,
      attemptId: attempt.id,
      studentName: attempt.studentName,
      studentUid: attempt.studentUid,
      snapshots,
      count: snapshots.length,
    };
  }

  async reviewAttempt(
    assessmentId: string,
    attemptId: string,
    dto: ReviewAttemptDto,
    user: any,
  ) {
    const userId = user?.id || user?._id;

    const assessment = await this.assessmentRepo.findOne({
      where: [{ id: assessmentId }, { mongoId: assessmentId }],
    });
    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }

    const isAdmin =
      user && ['admin', 'super_admin'].includes(user.role);
    if (!isAdmin && assessment.created_by_id !== userId) {
      throw new ForbiddenException(
        'You are not authorized to review attempts for this assessment',
      );
    }

    const attempt = await this.attemptRepo.findOne({
      where: { id: attemptId },
    });
    if (!attempt) {
      throw new NotFoundException('Assessment attempt not found');
    }

    if (
      attempt.assessmentId !== assessment.id &&
      attempt.assessmentId !== assessmentId
    ) {
      throw new BadRequestException('Attempt does not belong to this assessment');
    }

    if (dto.manualScoreAdjustment !== undefined) {
      attempt.manualScoreAdjustment = dto.manualScoreAdjustment;
      const baseScore =
        attempt.rawScore !== undefined ? attempt.rawScore : attempt.score;
      const penalty = attempt.proctoringPenalty || 0;
      const newScore = Math.max(
        0,
        baseScore - penalty + dto.manualScoreAdjustment,
      );
      attempt.score = newScore;

      const passThreshold =
        assessment.passingMarks ??
        (assessment.totalMarks ? assessment.totalMarks * 0.4 : 0);
      attempt.passed = attempt.score >= passThreshold;

      if (attempt.maxScore > 0) {
        attempt.percentage = Math.round(
          (attempt.score / attempt.maxScore) * 100,
        );
      }
    }

    if (dto.instructorFeedback !== undefined) {
      attempt.instructorFeedback = dto.instructorFeedback.trim();
    }

    if (dto.clearRadarFlags === true) {
      attempt.radarFlagsCleared = true;
    }

    attempt.reviewedById = userId;
    attempt.reviewedAt = new Date();

    await this.attemptRepo.save(attempt);

    return {
      success: true,
      message: 'Attempt review recorded successfully',
      attempt: {
        id: attempt.id,
        score: attempt.score,
        passed: attempt.passed,
        percentage: attempt.percentage,
        manualScoreAdjustment: attempt.manualScoreAdjustment,
        instructorFeedback: attempt.instructorFeedback,
        radarFlagsCleared: attempt.radarFlagsCleared,
        reviewedById: attempt.reviewedById,
        reviewedAt: attempt.reviewedAt,
      },
    };
  }
}
