import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { LearningPath } from '../entities/learning-path.entity';
import { LearningPathCourse } from '../entities/learning-path-course.entity';
import { Course } from '../entities/course.entity';
import { CourseModule } from '../entities/course-module.entity';
import { Lesson } from '../entities/lesson.entity';
import { CourseExercise } from '../entities/course-exercise.entity';
import { BadgeDefinition } from '../entities/badge-definition.entity';
import { CertificateTemplate } from '../entities/certificate-template.entity';
import { Certificate } from '../entities/certificate.entity';
import { LearningEnrollment } from '../entities/learning-enrollment.entity';
import { LessonProgress } from '../entities/lesson-progress.entity';
import { CourseProgress } from '../entities/course-progress.entity';
import { PathProgress } from '../entities/path-progress.entity';
import { applyLearningModuleMigration } from '../../database/migrations/learning-module';
import {
  CreateLearningPathDto,
  UpdateLearningPathDto,
} from '../dto/learning-path.dto';
import {
  CreateCourseDto,
  CreateCourseModuleDto,
  UpdateCourseModuleDto,
  CreateLessonDto,
  CreateCourseExerciseDto,
} from '../dto/course.dto';
import {
  CreateBadgeDto,
  CreateCertificateTemplateDto,
} from '../dto/badge-and-cert.dto';

@Injectable()
export class AdminLearningService {
  private readonly logger = new Logger(AdminLearningService.name);

  constructor(
    @InjectRepository(LearningPath)
    private readonly pathRepo: Repository<LearningPath>,
    @InjectRepository(LearningPathCourse)
    private readonly lpcRepo: Repository<LearningPathCourse>,
    @InjectRepository(Course)
    private readonly courseRepo: Repository<Course>,
    @InjectRepository(CourseModule)
    private readonly moduleRepo: Repository<CourseModule>,
    @InjectRepository(Lesson)
    private readonly lessonRepo: Repository<Lesson>,
    @InjectRepository(CourseExercise)
    private readonly exerciseRepo: Repository<CourseExercise>,
    @InjectRepository(BadgeDefinition)
    private readonly badgeDefRepo: Repository<BadgeDefinition>,
    @InjectRepository(CertificateTemplate)
    private readonly templateRepo: Repository<CertificateTemplate>,
    @InjectRepository(Certificate)
    private readonly certRepo: Repository<Certificate>,
    @InjectRepository(LearningEnrollment)
    private readonly enrollmentRepo: Repository<LearningEnrollment>,
    @Optional()
    @InjectRepository(LessonProgress)
    private readonly lessonProgressRepo?: Repository<LessonProgress>,
    @Optional()
    @InjectRepository(CourseProgress)
    private readonly courseProgressRepo?: Repository<CourseProgress>,
    @Optional()
    @InjectRepository(PathProgress)
    private readonly pathProgressRepo?: Repository<PathProgress>,
  ) {}

  async runMigrationColumnsIfNotExist() {
    try {
      await applyLearningModuleMigration(this.moduleRepo);
      await this.moduleRepo.query(`
        ALTER TABLE "course_modules" ADD COLUMN IF NOT EXISTS "requiredTimeMinutes" integer NOT NULL DEFAULT 2;
        ALTER TABLE "course_modules" ADD COLUMN IF NOT EXISTS "requiredTimeSeconds" integer NOT NULL DEFAULT 30;
        ALTER TABLE "lesson_progress" ADD COLUMN IF NOT EXISTS "timeSpentSeconds" integer NOT NULL DEFAULT 0;
      `);
    } catch (err: any) {
      this.logger.debug(`Migration check ignored: ${err?.message}`);
    }
  }

  async acquireAdvisoryLock(lockId: number): Promise<boolean> {
    try {
      const res = await this.moduleRepo.query(
        `SELECT pg_try_advisory_lock(${lockId}) as acquired`,
      );
      return res?.[0]?.acquired === true || res?.[0]?.acquired === 't';
    } catch (err: any) {
      this.logger.debug(`Advisory lock check fallback: ${err?.message}`);
      return true;
    }
  }

  async releaseAdvisoryLock(lockId: number): Promise<void> {
    try {
      await this.moduleRepo.query(`SELECT pg_advisory_unlock(${lockId})`);
    } catch {
      // Ignored
    }
  }

  // ── Learning Paths ──────────────────────────────────────────────────────────

  async getAllPaths() {
    return this.pathRepo.find({
      relations: { pathCourses: { course: true } },
      order: { createdAt: 'DESC' },
    });
  }

  async createPath(dto: CreateLearningPathDto) {
    const slug =
      dto.slug ||
      dto.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');

    let path = await this.pathRepo.findOne({ where: { slug } });
    if (!path) {
      path = this.pathRepo.create({
        title: dto.title,
        slug,
        description: dto.description || '',
        difficulty: dto.difficulty || 'beginner',
        iconUrl: dto.iconUrl || '',
        estimatedHours: dto.estimatedHours || 10,
        tags: dto.tags || [],
        status: dto.status || 'draft',
        completionCriteria: {
          minCourseCompletionRate: dto.completionCriteria?.minCourseCompletionRate ?? 100,
          requireAllMandatory: dto.completionCriteria?.requireAllMandatory ?? true,
          passQuizThreshold: dto.completionCriteria?.passQuizThreshold ?? 70,
        },
      });
      path = await this.pathRepo.save(path);
    } else {
      if (dto.title) path.title = dto.title;
      if (dto.description !== undefined) path.description = dto.description;
      if (dto.difficulty) path.difficulty = dto.difficulty;
      if (dto.iconUrl !== undefined) path.iconUrl = dto.iconUrl;
      if (dto.estimatedHours) path.estimatedHours = dto.estimatedHours;
      if (dto.tags) path.tags = dto.tags;
      if (dto.status) path.status = dto.status;
      path = await this.pathRepo.save(path);
    }

    // Attach courses if specified
    if (dto.courseIds && dto.courseIds.length > 0) {
      await this.lpcRepo.delete({ pathId: path.id });
      for (let i = 0; i < dto.courseIds.length; i++) {
        const lpc = this.lpcRepo.create({
          pathId: path.id,
          courseId: dto.courseIds[i],
          order: i + 1,
          isMandatory: true,
        });
        await this.lpcRepo.save(lpc);
      }
    }

    return this.pathRepo.findOne({
      where: { id: path.id },
      relations: { pathCourses: { course: true } },
    });
  }

  async updatePath(id: string, dto: UpdateLearningPathDto) {
    const path = await this.pathRepo.findOne({ where: { id } });
    if (!path) {
      throw new NotFoundException(`Learning path not found: ${id}`);
    }

    if (dto.title) path.title = dto.title;
    if (dto.description !== undefined) path.description = dto.description;
    if (dto.difficulty) path.difficulty = dto.difficulty;
    if (dto.iconUrl !== undefined) path.iconUrl = dto.iconUrl;
    if (dto.estimatedHours) path.estimatedHours = dto.estimatedHours;
    if (dto.tags) path.tags = dto.tags;
    if (dto.status) path.status = dto.status;
    if (dto.completionCriteria) {
      path.completionCriteria = {
        minCourseCompletionRate: dto.completionCriteria.minCourseCompletionRate ?? path.completionCriteria.minCourseCompletionRate,
        requireAllMandatory: dto.completionCriteria.requireAllMandatory ?? path.completionCriteria.requireAllMandatory,
        passQuizThreshold: dto.completionCriteria.passQuizThreshold ?? path.completionCriteria.passQuizThreshold,
      };
    }

    await this.pathRepo.save(path);

    if (dto.courseIds) {
      await this.lpcRepo.delete({ pathId: id });
      for (let i = 0; i < dto.courseIds.length; i++) {
        const lpc = this.lpcRepo.create({
          pathId: id,
          courseId: dto.courseIds[i],
          order: i + 1,
          isMandatory: true,
        });
        await this.lpcRepo.save(lpc);
      }
    }

    return this.pathRepo.findOne({
      where: { id },
      relations: { pathCourses: { course: true } },
    });
  }

  async publishPath(id: string) {
    const path = await this.pathRepo.findOne({
      where: { id },
      relations: { pathCourses: true },
    });
    if (!path) {
      throw new NotFoundException(`Learning path not found: ${id}`);
    }

    if (!path.pathCourses || path.pathCourses.length === 0) {
      throw new BadRequestException('Cannot publish a path with 0 courses');
    }

    path.status = 'published';
    path.version += 1;
    return this.pathRepo.save(path);
  }

  // ── Courses ─────────────────────────────────────────────────────────────────

  async getAllCourses() {
    return this.courseRepo.find({
      relations: { modules: { lessons: true } },
      order: { createdAt: 'DESC' },
    });
  }

  async createCourse(dto: CreateCourseDto) {
    const slug =
      dto.slug ||
      dto.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');

    let course = await this.courseRepo.findOne({ where: { slug } });
    if (course) {
      if (dto.title) course.title = dto.title;
      if (dto.description !== undefined) course.description = dto.description;
      if (dto.difficulty) course.difficulty = dto.difficulty;
      if (dto.estimatedMinutes) course.estimatedMinutes = dto.estimatedMinutes;
      if (dto.status) course.status = dto.status;
      return this.courseRepo.save(course);
    }

    course = this.courseRepo.create({
      title: dto.title,
      slug,
      description: dto.description || '',
      difficulty: dto.difficulty || 'beginner',
      estimatedMinutes: dto.estimatedMinutes || 60,
      status: dto.status || 'published',
    });
    return this.courseRepo.save(course);
  }

  async cleanupLegacyModules(courseId: string, allowedTitles: string[]): Promise<void> {
    try {
      const allModules = await this.moduleRepo.find({ where: { courseId } });
      for (const mod of allModules) {
        if (!allowedTitles.includes(mod.title)) {
          await this.moduleRepo.delete(mod.id);
        }
      }
    } catch (err: any) {
      this.logger.debug(`cleanupLegacyModules notice: ${err?.message}`);
    }
  }

  async createModule(courseId: string, dto: CreateCourseModuleDto) {
    const course = await this.courseRepo.findOne({ where: { id: courseId } });
    if (!course) throw new NotFoundException(`Course not found: ${courseId}`);

    const existing = await this.moduleRepo.findOne({
      where: { courseId, title: dto.title },
    });
    if (existing) {
      if (dto.description !== undefined) existing.description = dto.description;
      if (dto.order) existing.order = dto.order;
      if (dto.requiredTimeMinutes !== undefined) existing.requiredTimeMinutes = dto.requiredTimeMinutes;
      if (dto.requiredTimeSeconds !== undefined) {
        existing.requiredTimeSeconds = dto.requiredTimeSeconds;
      } else if (dto.requiredTimeMinutes !== undefined) {
        existing.requiredTimeSeconds = dto.requiredTimeMinutes * 60;
      }
      return this.moduleRepo.save(existing);
    }

    const existingModules = await this.moduleRepo.find({ where: { courseId } });
    const order = dto.order || existingModules.length + 1;
    const requiredTimeMinutes = dto.requiredTimeMinutes !== undefined ? dto.requiredTimeMinutes : 2;
    const requiredTimeSeconds =
      dto.requiredTimeSeconds !== undefined
        ? dto.requiredTimeSeconds
        : requiredTimeMinutes * 60;
    const isMandatory = dto.isMandatory !== undefined ? dto.isMandatory : true;

    const mod = this.moduleRepo.create({
      courseId,
      title: dto.title,
      description: dto.description || '',
      order,
      requiredTimeMinutes,
      requiredTimeSeconds,
      isMandatory,
    });
    return this.moduleRepo.save(mod);
  }

  async updateModule(moduleId: string, dto: UpdateCourseModuleDto) {
    const mod = await this.moduleRepo.findOne({ where: { id: moduleId } });
    if (!mod) throw new NotFoundException(`Module not found: ${moduleId}`);

    if (dto.title !== undefined) mod.title = dto.title;
    if (dto.description !== undefined) mod.description = dto.description;
    if (dto.order !== undefined) mod.order = dto.order;
    if (dto.isMandatory !== undefined) mod.isMandatory = dto.isMandatory;
    if (dto.requiredTimeMinutes !== undefined) mod.requiredTimeMinutes = dto.requiredTimeMinutes;
    if (dto.requiredTimeSeconds !== undefined) {
      mod.requiredTimeSeconds = dto.requiredTimeSeconds;
    } else if (dto.requiredTimeMinutes !== undefined) {
      mod.requiredTimeSeconds = dto.requiredTimeMinutes * 60;
    }

    return this.moduleRepo.save(mod);
  }

  async deleteModule(moduleId: string) {
    const mod = await this.moduleRepo.findOne({ where: { id: moduleId } });
    if (!mod) throw new NotFoundException(`Module not found: ${moduleId}`);
    await this.moduleRepo.remove(mod);
    return { success: true };
  }

  async createLesson(moduleId: string, dto: CreateLessonDto) {
    const mod = await this.moduleRepo.findOne({ where: { id: moduleId } });
    if (!mod) throw new NotFoundException(`Module not found: ${moduleId}`);

    const slug =
      dto.slug ||
      dto.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');

    const existing = await this.lessonRepo.findOne({
      where: { moduleId, slug },
    });
    if (existing) {
      existing.title = dto.title;
      existing.content = dto.content;
      if (dto.learningObjectives) existing.learningObjectives = dto.learningObjectives;
      if (dto.type) existing.type = dto.type;
      if (dto.order) existing.order = dto.order;
      return this.lessonRepo.save(existing);
    }

    const existingLessons = await this.lessonRepo.find({ where: { moduleId } });
    const order = dto.order || existingLessons.length + 1;
    const isMandatory = dto.isMandatory !== undefined ? dto.isMandatory : true;

    const lesson = this.lessonRepo.create({
      moduleId,
      title: dto.title,
      slug,
      content: dto.content,
      learningObjectives: dto.learningObjectives || [],
      order,
      type: dto.type || 'reading',
      passingScore: dto.passingScore || 0,
      isMandatory,
    });
    return this.lessonRepo.save(lesson);
  }

  async createExercise(lessonId: string, dto: CreateCourseExerciseDto) {
    const lesson = await this.lessonRepo.findOne({ where: { id: lessonId } });
    if (!lesson) throw new NotFoundException(`Lesson not found: ${lessonId}`);

    const existing = await this.exerciseRepo.findOne({
      where: { lessonId, title: dto.title },
    });
    if (existing) {
      existing.type = dto.type || existing.type;
      if (dto.problemId) existing.problemId = dto.problemId;
      if (dto.quizConfig) existing.quizConfig = dto.quizConfig;
      if (dto.starterCode) existing.starterCode = dto.starterCode;
      if (dto.hints) existing.hints = dto.hints;
      if (dto.marks) existing.marks = dto.marks;
      if (dto.isMandatory !== undefined) existing.isMandatory = dto.isMandatory;
      if (dto.order) existing.order = dto.order;
      return this.exerciseRepo.save(existing);
    }

    const existingExercises = await this.exerciseRepo.find({ where: { lessonId } });
    const order = dto.order || existingExercises.length + 1;

    const exercise = this.exerciseRepo.create({
      lessonId,
      title: dto.title,
      type: dto.type || 'coding',
      problemId: dto.problemId,
      quizConfig: dto.quizConfig,
      starterCode: dto.starterCode,
      hints: dto.hints || [],
      marks: dto.marks || 10,
      isMandatory: dto.isMandatory !== undefined ? dto.isMandatory : true,
      order,
    });
    return this.exerciseRepo.save(exercise);
  }

  // ── Badges & Templates ──────────────────────────────────────────────────────

  async createBadge(dto: CreateBadgeDto) {
    let badge = await this.badgeDefRepo.findOne({ where: { code: dto.code } });
    if (badge) {
      badge.name = dto.name;
      if (dto.description !== undefined) badge.description = dto.description;
      if (dto.iconUrl !== undefined) badge.iconUrl = dto.iconUrl;
      if (dto.rarity) badge.rarity = dto.rarity;
      if (dto.category) badge.category = dto.category;
      if (dto.criteria) badge.criteria = dto.criteria;
      return this.badgeDefRepo.save(badge);
    }

    badge = this.badgeDefRepo.create({
      code: dto.code,
      name: dto.name,
      description: dto.description || '',
      iconUrl: dto.iconUrl || '',
      rarity: dto.rarity || 'common',
      category: dto.category || 'milestone',
      criteria: dto.criteria || {},
    });
    return this.badgeDefRepo.save(badge);
  }

  async getAllBadges() {
    return this.badgeDefRepo.find({ order: { createdAt: 'DESC' } });
  }

  async createCertificateTemplate(dto: CreateCertificateTemplateDto) {
    let template = await this.templateRepo.findOne({ where: { name: dto.name } });
    if (template) return template;

    template = this.templateRepo.create({
      name: dto.name,
      title: dto.title || 'Certificate of Achievement',
      issuerTitle: dto.issuerTitle || 'Head of Technical Training',
      issuerName: dto.issuerName || 'Technical Training Team',
      issuerOrganization:
        dto.issuerOrganization || 'CodeSkill · Chandigarh University',
      logoUrl: dto.logoUrl || '',
      signatureUrl: dto.signatureUrl || '',
      badgeUrl: dto.badgeUrl || '',
      isDefault: dto.isDefault || false,
    });
    return this.templateRepo.save(template);
  }

  // ── Analytics & Overview ────────────────────────────────────────────────────

  async getLearningAnalytics() {
    const totalPaths = await this.pathRepo.count();
    const totalCourses = await this.courseRepo.count();
    const totalEnrollments = await this.enrollmentRepo.count();
    const totalCertificates = await this.certRepo.count({
      where: { status: 'valid' },
    });

    const recentCertificates = await this.certRepo.find({
      order: { issueDate: 'DESC' },
      take: 10,
    });

    return {
      totalPaths,
      totalCourses,
      totalEnrollments,
      totalCertificates,
      recentCertificates,
    };
  }

  async getPathDetails(id: string) {
    const path = await this.pathRepo.findOne({
      where: { id },
      relations: {
        pathCourses: {
          course: {
            modules: {
              lessons: {
                exercises: true,
              },
            },
          },
        },
      },
    });
    if (!path) throw new NotFoundException(`Learning path not found: ${id}`);
    return path;
  }

  async deletePath(id: string) {
    const path = await this.pathRepo.findOne({ where: { id } });
    if (!path) throw new NotFoundException(`Learning path not found: ${id}`);
    await this.lpcRepo.delete({ pathId: id });
    await this.enrollmentRepo.delete({ pathId: id });
    await this.pathRepo.query('DELETE FROM "path_progress" WHERE "pathId" = $1', [id]).catch(() => {});
    await this.pathRepo.query('DELETE FROM "course_progress" WHERE "pathId" = $1', [id]).catch(() => {});
    await this.pathRepo.remove(path);
    return { success: true };
  }

  async getCourseById(id: string) {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id,
      );
    const course = await this.courseRepo.findOne({
      where: isUuid ? [{ id }, { slug: id }] : { slug: id },
      relations: {
        modules: {
          lessons: {
            exercises: true,
          },
        },
      },
    });
    if (!course) {
      throw new NotFoundException(`Course not found: ${id}`);
    }
    if (course.modules) {
      course.modules.sort((a, b) => a.order - b.order);
      for (const mod of course.modules) {
        if (mod.lessons) {
          mod.lessons.sort((a, b) => a.order - b.order);
          for (const les of mod.lessons) {
            if (les.exercises) {
              les.exercises.sort((a, b) => a.order - b.order);
            }
          }
        }
      }
    }
    return course;
  }

  async updateCourse(id: string, dto: Partial<CreateCourseDto>) {
    const course = await this.courseRepo.findOne({ where: { id } });
    if (!course) throw new NotFoundException(`Course not found: ${id}`);
    if (dto.title) course.title = dto.title;
    if (dto.description !== undefined) course.description = dto.description;
    if (dto.difficulty) course.difficulty = dto.difficulty;
    if (dto.estimatedMinutes) course.estimatedMinutes = dto.estimatedMinutes;
    return this.courseRepo.save(course);
  }

  async deleteCourse(id: string) {
    const course = await this.courseRepo.findOne({ where: { id } });
    if (!course) throw new NotFoundException(`Course not found: ${id}`);
    await this.courseRepo.remove(course);
    return { success: true };
  }

  async updateLesson(id: string, dto: Partial<CreateLessonDto>) {
    const lesson = await this.lessonRepo.findOne({ where: { id } });
    if (!lesson) throw new NotFoundException(`Lesson not found: ${id}`);
    if (dto.title) lesson.title = dto.title;
    if (dto.content !== undefined) lesson.content = dto.content;
    if (dto.type) lesson.type = dto.type;
    if (dto.learningObjectives) lesson.learningObjectives = dto.learningObjectives;
    if (dto.isMandatory !== undefined) lesson.isMandatory = dto.isMandatory;
    return this.lessonRepo.save(lesson);
  }

  async updateExercise(id: string, dto: Partial<CreateCourseExerciseDto>) {
    const ex = await this.exerciseRepo.findOne({ where: { id } });
    if (!ex) throw new NotFoundException(`Exercise not found: ${id}`);
    if (dto.title) ex.title = dto.title;
    if (dto.type) ex.type = dto.type;
    if (dto.problemId !== undefined) ex.problemId = dto.problemId;
    if (dto.quizConfig !== undefined) ex.quizConfig = dto.quizConfig;
    if (dto.starterCode !== undefined) ex.starterCode = dto.starterCode;
    if (dto.hints !== undefined) ex.hints = dto.hints;
    if (dto.marks !== undefined) ex.marks = dto.marks;
    if (dto.isMandatory !== undefined) ex.isMandatory = dto.isMandatory;
    if (dto.order !== undefined) ex.order = dto.order;
    return this.exerciseRepo.save(ex);
  }

  async deleteLesson(id: string) {
    const lesson = await this.lessonRepo.findOne({ where: { id } });
    if (!lesson) throw new NotFoundException(`Lesson not found: ${id}`);
    await this.lessonRepo.remove(lesson);
    return { success: true };
  }

  async deleteExercise(id: string) {
    const ex = await this.exerciseRepo.findOne({ where: { id } });
    if (!ex) throw new NotFoundException(`Exercise not found: ${id}`);
    await this.exerciseRepo.remove(ex);
    return { success: true };
  }

  async getAllCertificates() {
    return this.certRepo.find({
      order: { issueDate: 'DESC' },
    });
  }

  async getCertificateTemplates() {
    return this.templateRepo.find({
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Resets student progress for a course (or all students if studentId is omitted)
   */
  async resetCourseProgress(courseId: string, studentId?: string) {
    const course = await this.courseRepo.findOne({
      where: { id: courseId },
      relations: { modules: { lessons: true } },
    });
    if (!course) throw new NotFoundException(`Course not found: ${courseId}`);

    const lessonIds = (course.modules || []).flatMap((m) =>
      (m.lessons || []).map((l) => l.id),
    );

    let resetLessons = 0;
    if (this.lessonProgressRepo && lessonIds.length > 0) {
      if (studentId) {
        await this.lessonProgressRepo.delete({
          lessonId: In(lessonIds),
          studentId,
        });
      } else {
        await this.lessonProgressRepo.delete({
          lessonId: In(lessonIds),
        });
      }
      resetLessons = lessonIds.length;
    }

    if (this.courseProgressRepo) {
      if (studentId) {
        await this.courseProgressRepo.delete({ courseId, studentId });
      } else {
        await this.courseProgressRepo.delete({ courseId });
      }
    }

    // If learning paths include this course, reset or adjust path progress
    if (this.lpcRepo && this.pathProgressRepo) {
      const lpcs = await this.lpcRepo.find({ where: { courseId } });
      for (const lpc of lpcs) {
        if (studentId) {
          const pp = await this.pathProgressRepo.findOne({
            where: { pathId: lpc.pathId, studentId },
          });
          if (pp) {
            pp.isCertified = false;
            pp.percentage = 0;
            pp.status = 'in_progress';
            await this.pathProgressRepo.save(pp);
          }
        } else {
          await this.pathProgressRepo.update(
            { pathId: lpc.pathId },
            { isCertified: false, percentage: 0, status: 'in_progress' },
          );
        }
      }
    }

    return {
      success: true,
      message: studentId
        ? `Course progress for student ${studentId} has been successfully reset.`
        : `All student progress for course "${course.title}" has been successfully reset.`,
      courseId,
      resetLessonsCount: resetLessons,
    };
  }
}
