jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));

import { LearningAutoSeedService } from './learning-auto-seed.service';
import { AdminLearningService } from './admin-learning.service';

describe('LearningAutoSeedService', () => {
  let service: LearningAutoSeedService;
  let adminService: jest.Mocked<AdminLearningService>;

  beforeEach(() => {
    adminService = {
      runMigrationColumnsIfNotExist: jest.fn().mockResolvedValue(undefined),
      acquireAdvisoryLock: jest.fn().mockResolvedValue(true),
      releaseAdvisoryLock: jest.fn().mockResolvedValue(undefined),
      createBadge: jest.fn().mockResolvedValue({ id: 'badge-1' } as any),
      createCertificateTemplate: jest.fn().mockResolvedValue({ id: 'tmpl-1' } as any),
      createCourse: jest.fn().mockImplementation((dto) =>
        Promise.resolve({ id: `course-${dto.slug}`, ...dto } as any),
      ),
      createModule: jest.fn().mockImplementation((courseId, dto) =>
        Promise.resolve({ id: `mod-${courseId}-${dto.order}`, ...dto } as any),
      ),
      createLesson: jest.fn().mockImplementation((modId, dto) =>
        Promise.resolve({ id: `lesson-${modId}-${dto.slug}`, ...dto } as any),
      ),
      createExercise: jest.fn().mockImplementation((lessonId, dto) =>
        Promise.resolve({ id: `exercise-${lessonId}-${dto.order}`, ...dto } as any),
      ),
      createPath: jest.fn().mockImplementation((dto) =>
        Promise.resolve({ id: `path-${dto.slug}`, ...dto } as any),
      ),
      publishPath: jest.fn().mockResolvedValue({ status: 'published' } as any),
    } as unknown as jest.Mocked<AdminLearningService>;

    service = new LearningAutoSeedService(adminService);
  });

  it('acquires advisory lock and seeds badges, templates, CS Core and enterprise curriculum', async () => {
    await service.seedCurriculumIfNotExist();

    expect(adminService.acquireAdvisoryLock).toHaveBeenCalledWith(1902230165);
    expect(adminService.runMigrationColumnsIfNotExist).toHaveBeenCalled();
    // 16 badges seeded
    expect(adminService.createBadge).toHaveBeenCalledTimes(16);
    expect(adminService.createCertificateTemplate).toHaveBeenCalled();

    // Verify both CS Core and Enterprise courses are created
    expect(adminService.createCourse).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'dbms-core-engineering' }),
    );
    expect(adminService.createCourse).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'java-programming-mastery' }),
    );
    expect(adminService.createCourse).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'ai-foundations-llm' }),
    );
    expect(adminService.createCourse).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'agentic-ai-langchain-langgraph' }),
    );
    expect(adminService.createCourse).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'python-core-fundamentals' }),
    );
    expect(adminService.createCourse).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'javascript-foundations' }),
    );
    expect(adminService.createCourse).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'arrays-and-two-pointers' }),
    );

    // Verify paths created
    expect(adminService.createPath).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'cs-core-engineering' }),
    );
    expect(adminService.createPath).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'genai-agentic-architecture' }),
    );
    expect(adminService.createPath).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'ai-prompt-engineering' }),
    );
    expect(adminService.createPath).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'python-complete-mastery' }),
    );
    expect(adminService.createPath).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'javascript-mastery' }),
    );
    expect(adminService.createPath).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'dsa-mastery' }),
    );

    expect(adminService.releaseAdvisoryLock).toHaveBeenCalledWith(1902230165);
  });

  it('skips execution gracefully if advisory lock is already held by another instance', async () => {
    adminService.acquireAdvisoryLock.mockResolvedValue(false);

    await service.seedCurriculumIfNotExist();

    expect(adminService.acquireAdvisoryLock).toHaveBeenCalledWith(1902230165);
    expect(adminService.runMigrationColumnsIfNotExist).not.toHaveBeenCalled();
    expect(adminService.createCourse).not.toHaveBeenCalled();
    expect(adminService.releaseAdvisoryLock).not.toHaveBeenCalled();
  });

  it('always releases the advisory lock if an error occurs during seeding', async () => {
    adminService.createBadge.mockRejectedValueOnce(new Error('Fatal DB crash'));

    // Try catch is internal for badges, let runMigrationColumnsIfNotExist throw to test lock release on unexpected error
    adminService.runMigrationColumnsIfNotExist.mockRejectedValueOnce(new Error('DB failure'));

    await expect(service.seedCurriculumIfNotExist()).rejects.toThrow('DB failure');

    expect(adminService.acquireAdvisoryLock).toHaveBeenCalledWith(1902230165);
    expect(adminService.releaseAdvisoryLock).toHaveBeenCalledWith(1902230165);
  });
});
