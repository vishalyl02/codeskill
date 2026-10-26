jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));

import { LearningService } from './services/learning.service';

describe('LearningService', () => {
  let service: LearningService;

  const mockQueryBuilder = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([
      {
        id: 'path-uuid-1',
        title: 'JavaScript Mastery',
        slug: 'javascript-mastery',
        description: 'Comprehensive JS course',
        difficulty: 'beginner',
        estimatedHours: 10,
        tags: ['JS'],
        version: 1,
        pathCourses: [],
      },
    ]),
  };

  const mockPathRepo = {
    createQueryBuilder: jest.fn(() => mockQueryBuilder),
    findOne: jest.fn(),
    findBy: jest.fn(),
    save: jest.fn(),
  };

  const mockCourseRepo = { findOne: jest.fn(), find: jest.fn() };
  const mockModuleRepo = { find: jest.fn(), findOne: jest.fn() };
  const mockLessonRepo = { find: jest.fn(), findOne: jest.fn() };

  const mockEnrollmentRepo = {
    findOne: jest.fn(),
    create: jest.fn((dto) => ({ id: 'enroll-uuid-1', ...dto })),
    save: jest.fn((e) => Promise.resolve(e)),
  };

  const mockLessonProgressRepo = { findOne: jest.fn(), createQueryBuilder: jest.fn() };
  const mockCourseProgressRepo = { findOne: jest.fn() };

  const mockPathProgressRepo = {
    findOne: jest.fn(),
    create: jest.fn((dto) => ({ id: 'prog-uuid-1', ...dto })),
    save: jest.fn((p) => Promise.resolve(p)),
  };

  beforeEach(() => {
    service = new LearningService(
      mockPathRepo as any,
      mockCourseRepo as any,
      mockModuleRepo as any,
      mockLessonRepo as any,
      mockEnrollmentRepo as any,
      mockLessonProgressRepo as any,
      mockCourseProgressRepo as any,
      mockPathProgressRepo as any,
    );
  });

  it('should list published learning paths', async () => {
    const paths = await service.getPublishedPaths();
    expect(paths).toBeDefined();
    expect(paths.length).toBe(1);
    expect(paths[0].title).toBe('JavaScript Mastery');
  });

  it('should enroll a student in a learning path idempotently', async () => {
    mockPathRepo.findOne.mockResolvedValue({
      id: 'path-uuid-1',
      version: 1,
      pathCourses: [],
    });
    mockEnrollmentRepo.findOne.mockResolvedValue(null);
    mockPathProgressRepo.findOne.mockResolvedValue(null);

    const result = await service.enrollStudent('path-uuid-1', 'student-uuid-1');
    expect(result).toBeDefined();
    expect(result.pathId).toBe('path-uuid-1');
    expect(result.status).toBe('active');
  });
});
