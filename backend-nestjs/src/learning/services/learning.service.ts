import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { LearningPath } from '../entities/learning-path.entity';
import { Course } from '../entities/course.entity';
import { CourseModule } from '../entities/course-module.entity';
import { Lesson } from '../entities/lesson.entity';
import { LearningEnrollment } from '../entities/learning-enrollment.entity';
import { LessonProgress } from '../entities/lesson-progress.entity';
import { CourseProgress } from '../entities/course-progress.entity';
import { PathProgress } from '../entities/path-progress.entity';

@Injectable()
export class LearningService {
  private readonly logger = new Logger(LearningService.name);

  constructor(
    @InjectRepository(LearningPath)
    private readonly pathRepo: Repository<LearningPath>,
    @InjectRepository(Course)
    private readonly courseRepo: Repository<Course>,
    @InjectRepository(CourseModule)
    private readonly moduleRepo: Repository<CourseModule>,
    @InjectRepository(Lesson)
    private readonly lessonRepo: Repository<Lesson>,
    @InjectRepository(LearningEnrollment)
    private readonly enrollmentRepo: Repository<LearningEnrollment>,
    @InjectRepository(LessonProgress)
    private readonly lessonProgressRepo: Repository<LessonProgress>,
    @InjectRepository(CourseProgress)
    private readonly courseProgressRepo: Repository<CourseProgress>,
    @InjectRepository(PathProgress)
    private readonly pathProgressRepo: Repository<PathProgress>,
  ) {}

  /**
   * List published learning paths with enrollment and progress stats
   */
  async getPublishedPaths(
    studentId?: string,
    query?: { search?: string; difficulty?: string; tag?: string },
  ) {
    const qb = this.pathRepo
      .createQueryBuilder('path')
      .leftJoinAndSelect('path.pathCourses', 'pc')
      .leftJoinAndSelect('pc.course', 'course')
      .where('path.status = :status', { status: 'published' })
      .orderBy('path.createdAt', 'DESC');

    if (query?.search) {
      qb.andWhere(
        '(LOWER(path.title) LIKE :search OR LOWER(path.description) LIKE :search)',
        { search: `%${query.search.toLowerCase()}%` },
      );
    }
    if (query?.difficulty) {
      qb.andWhere('path.difficulty = :difficulty', {
        difficulty: query.difficulty,
      });
    }

    const paths = await qb.getMany();

    // Enrich with student progress if studentId is provided
    const enriched = await Promise.all(
      paths.map(async (p) => {
        let isEnrolled = false;
        let progressPercent = 0;
        let completedCourses = 0;

        if (studentId) {
          const enrollment = await this.enrollmentRepo.findOne({
            where: { studentId, pathId: p.id },
          });
          isEnrolled = !!enrollment;

          const progress = await this.pathProgressRepo.findOne({
            where: { studentId, pathId: p.id },
          });
          if (progress) {
            progressPercent = progress.percentage;
            completedCourses = progress.completedCoursesCount;
          }
        }

        const courses = (p.pathCourses || [])
          .sort((a, b) => a.order - b.order)
          .map((pc) => ({
            id: pc.course?.id || pc.courseId,
            title: pc.course?.title,
            slug: pc.course?.slug,
            difficulty: pc.course?.difficulty,
            estimatedMinutes: pc.course?.estimatedMinutes,
            isMandatory: pc.isMandatory,
          }));

        return {
          id: p.id,
          title: p.title,
          slug: p.slug,
          description: p.description,
          difficulty: p.difficulty,
          estimatedHours: p.estimatedHours,
          tags: p.tags,
          version: p.version,
          courseCount: courses.length,
          courses,
          isEnrolled,
          progressPercent,
          completedCourses,
        };
      }),
    );

    return enriched;
  }

  /**
   * Get path details by slug with full curriculum syllabus
   */
  async getPathBySlug(slug: string, studentId?: string) {
    const path = await this.pathRepo.findOne({
      where: { slug },
      relations: {
        pathCourses: {
          course: {
            modules: {
              lessons: true,
            },
          },
        },
      },
    });
    if (!path) {
      throw new NotFoundException(`Learning path not found: ${slug}`);
    }

    let isEnrolled = false;
    let pathProgress: PathProgress | null = null;
    if (studentId) {
      const enrollment = await this.enrollmentRepo.findOne({
        where: { studentId, pathId: path.id },
      });
      isEnrolled = !!enrollment;
      pathProgress = await this.pathProgressRepo.findOne({
        where: { studentId, pathId: path.id },
      });
    }

    // Sort curriculum and calculate course stats
    const sortedCourses = await Promise.all(
      (path.pathCourses || [])
        .sort((a, b) => a.order - b.order)
        .map(async (pc) => {
          const c = pc.course;
          let courseProgressPercent = 0;
          let isCourseCompleted = false;

          if (studentId && c) {
            const cp = await this.courseProgressRepo.findOne({
              where: { studentId, courseId: c.id },
            });
            if (cp) {
              courseProgressPercent = cp.percentage;
              isCourseCompleted = cp.status === 'completed';
            }
          }

          const modules = (c?.modules || [])
            .sort((a, b) => a.order - b.order)
            .map((m) => ({
              id: m.id,
              title: m.title,
              description: m.description,
              order: m.order,
              lessonsCount: m.lessons?.length || 0,
              lessons: (m.lessons || [])
                .sort((a, b) => a.order - b.order)
                .map((l) => ({
                  id: l.id,
                  title: l.title,
                  slug: l.slug,
                  type: l.type,
                  order: l.order,
                })),
            }));

          return {
            id: c?.id || pc.courseId,
            title: c?.title,
            slug: c?.slug,
            description: c?.description,
            difficulty: c?.difficulty,
            estimatedMinutes: c?.estimatedMinutes,
            isMandatory: pc.isMandatory,
            order: pc.order,
            modules,
            progressPercent: courseProgressPercent,
            isCompleted: isCourseCompleted,
          };
        }),
    );

    return {
      id: path.id,
      title: path.title,
      slug: path.slug,
      description: path.description,
      difficulty: path.difficulty,
      estimatedHours: path.estimatedHours,
      tags: path.tags,
      version: path.version,
      completionCriteria: path.completionCriteria,
      isEnrolled,
      progress: pathProgress
        ? {
            percentage: pathProgress.percentage,
            completedCourses: pathProgress.completedCoursesCount,
            totalCourses: pathProgress.totalCoursesCount,
            status: pathProgress.status,
            isCertified: pathProgress.isCertified,
          }
        : null,
      courses: sortedCourses,
    };
  }

  /**
   * Enroll a student into a learning path
   */
  async enrollStudent(pathId: string, studentId: string) {
    const path = await this.pathRepo.findOne({ where: { id: pathId } });
    if (!path) {
      throw new NotFoundException(`Learning path not found: ${pathId}`);
    }

    let enrollment = await this.enrollmentRepo.findOne({
      where: { studentId, pathId },
    });
    if (!enrollment) {
      enrollment = this.enrollmentRepo.create({
        studentId,
        pathId,
        pathVersion: path.version,
        status: 'active',
        enrolledAt: new Date(),
      });
      await this.enrollmentRepo.save(enrollment);
    }

    // Ensure path progress initialized
    let pathProgress = await this.pathProgressRepo.findOne({
      where: { studentId, pathId },
    });
    if (!pathProgress) {
      const pathCourses = await this.pathRepo.findOne({
        where: { id: pathId },
        relations: { pathCourses: true },
      });
      const totalCourses = pathCourses?.pathCourses?.length || 0;
      pathProgress = this.pathProgressRepo.create({
        studentId,
        pathId,
        percentage: 0,
        completedCoursesCount: 0,
        totalCoursesCount: totalCourses,
        status: 'in_progress',
      });
      await this.pathProgressRepo.save(pathProgress);
    }

    return {
      enrollmentId: enrollment.id,
      pathId,
      status: enrollment.status,
      enrolledAt: enrollment.enrolledAt,
    };
  }

  /**
   * Get course details with all modules, lessons, and completion statuses
   */
  async getCourseDetails(courseId: string, studentId: string) {
    const course = await this.courseRepo.findOne({
      where: { id: courseId },
      relations: {
        modules: {
          lessons: {
            exercises: true,
          },
        },
      },
    });
    if (!course) {
      throw new NotFoundException(`Course not found: ${courseId}`);
    }

    // Fetch all completed lessons for this student
    const lessonIds: string[] = [];
    (course.modules || []).forEach((m) => {
      (m.lessons || []).forEach((l) => lessonIds.push(l.id));
    });

    let completedLessonIds = new Set<string>();
    if (lessonIds.length > 0) {
      const progress = await this.lessonProgressRepo
        .createQueryBuilder('lp')
        .where('lp.studentId = :studentId', { studentId })
        .andWhere('lp.lessonId IN (:...lessonIds)', { lessonIds })
        .andWhere('lp.status = :status', { status: 'completed' })
        .getMany();
      completedLessonIds = new Set(progress.map((p) => p.lessonId));
    }

    const modules = (course.modules || [])
      .sort((a, b) => a.order - b.order)
      .map((m) => ({
        id: m.id,
        title: m.title,
        description: m.description,
        order: m.order,
        requiredTimeMinutes: m.requiredTimeMinutes || 1,
        requiredTimeSeconds: m.requiredTimeSeconds || 30,
        lessons: (m.lessons || [])
          .sort((a, b) => a.order - b.order)
          .map((l) => ({
            id: l.id,
            title: l.title,
            slug: l.slug,
            type: l.type,
            order: l.order,
            isCompleted: completedLessonIds.has(l.id),
            exerciseCount: l.exercises?.length || 0,
          })),
      }));

    return {
      id: course.id,
      title: course.title,
      slug: course.slug,
      description: course.description,
      difficulty: course.difficulty,
      estimatedMinutes: course.estimatedMinutes,
      modules,
    };
  }

  /**
   * Get single lesson content, exercises, and completion status
   */
  async getLessonContent(lessonId: string, studentId: string) {
    const lesson = await this.lessonRepo.findOne({
      where: { id: lessonId },
      relations: {
        exercises: true,
        module: {
          course: true,
        },
      },
    });
    if (!lesson) {
      throw new NotFoundException(`Lesson not found: ${lessonId}`);
    }

    const progress = await this.lessonProgressRepo.findOne({
      where: { studentId, lessonId },
    });

    // Strip answers from quizConfig so students cannot inspect client-side answers
    const sanitizedExercises = (lesson.exercises || [])
      .sort((a, b) => a.order - b.order)
      .map((e) => {
        let quizSafe = undefined;
        if (e.quizConfig && e.quizConfig.questions) {
          quizSafe = {
            questions: e.quizConfig.questions.map((q: any) => ({
              id: q.id,
              question: q.question,
              options: q.options,
              // DO NOT expose correctAnswer or explanation before submission
            })),
          };
        }
        return {
          id: e.id,
          title: e.title,
          type: e.type,
          problemId: e.problemId,
          starterCode: e.starterCode,
          hints: e.hints,
          marks: e.marks,
          isMandatory: e.isMandatory,
          order: e.order,
          quizConfig: quizSafe,
        };
      });

    // Find next lesson in the course
    const allModuleLessons = await this.lessonRepo.find({
      where: { moduleId: lesson.moduleId },
      order: { order: 'ASC' },
    });
    const currentIndex = allModuleLessons.findIndex((l) => l.id === lessonId);
    let nextLessonId: string | null = null;
    if (currentIndex >= 0 && currentIndex < allModuleLessons.length - 1) {
      nextLessonId = allModuleLessons[currentIndex + 1].id;
    }

    return {
      id: lesson.id,
      title: lesson.title,
      slug: lesson.slug,
      content: lesson.content,
      learningObjectives: lesson.learningObjectives,
      order: lesson.order,
      type: lesson.type,
      isCompleted: progress?.status === 'completed',
      completedAt: progress?.completedAt,
      timeSpentSeconds: progress?.timeSpentSeconds || 0,
      requiredTimeSeconds: lesson.module?.requiredTimeSeconds || 30,
      moduleId: lesson.moduleId,
      module: {
        id: lesson.module?.id,
        title: lesson.module?.title,
        requiredTimeMinutes: lesson.module?.requiredTimeMinutes || 1,
        requiredTimeSeconds: lesson.module?.requiredTimeSeconds || 30,
      },
      exercises: sanitizedExercises,
      nextLessonId,
      course: {
        id: lesson.module?.course?.id,
        title: lesson.module?.course?.title,
        slug: lesson.module?.course?.slug,
      },
    };
  }

  /**
   * Student dashboard progress: active enrolled paths and overall metrics
   */
  async getStudentProgressDashboard(studentId: string) {
    const enrollments = await this.enrollmentRepo.find({
      where: { studentId },
      order: { enrolledAt: 'DESC' },
    });

    const pathIds = enrollments.map((e) => e.pathId);
    if (pathIds.length === 0) {
      return {
        enrolledCount: 0,
        completedPathsCount: 0,
        activePaths: [],
      };
    }

    const paths = await this.pathRepo.findBy({ id: In(pathIds) });
    const pathProgresses = await this.pathProgressRepo.find({
      where: { studentId },
    });
    const progressMap = new Map(pathProgresses.map((p) => [p.pathId, p]));

    const activePaths = paths.map((p: LearningPath) => {
      const prog = progressMap.get(p.id);
      return {
        id: p.id,
        title: p.title,
        slug: p.slug,
        difficulty: p.difficulty,
        percentage: prog?.percentage || 0,
        completedCourses: prog?.completedCoursesCount || 0,
        totalCourses: prog?.totalCoursesCount || 0,
        status: prog?.status || 'in_progress',
        isCertified: prog?.isCertified || false,
      };
    });

    const completedPathsCount = activePaths.filter(
      (p: { status: string }) => p.status === 'completed',
    ).length;

    return {
      enrolledCount: enrollments.length,
      completedPathsCount,
      activePaths,
    };
  }
}
