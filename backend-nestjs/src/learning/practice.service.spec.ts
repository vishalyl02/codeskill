jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));

import { PracticeService } from './services/practice.service';
import { BadRequestException } from '@nestjs/common';

describe('PracticeService - Global Timer & Completion Standardization', () => {
  let service: PracticeService;

  const mockLessonRepo = {
    findOne: jest.fn(),
  };
  const mockExerciseRepo = {
    findOne: jest.fn(),
  };
  const mockLessonProgressRepo = {
    findOne: jest.fn(),
    create: jest.fn((dto) => dto),
    save: jest.fn((dto) => Promise.resolve(dto)),
  };
  const mockCourseProgressRepo = {
    findOne: jest.fn(),
    create: jest.fn((dto) => dto),
    save: jest.fn((dto) => Promise.resolve(dto)),
  };
  const mockPathProgressRepo = {
    findOne: jest.fn(),
    create: jest.fn((dto) => dto),
    save: jest.fn((dto) => Promise.resolve(dto)),
  };
  const mockModuleRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
  };
  const mockLpcRepo = {
    find: jest.fn(),
  };
  const mockProblemRepo = {
    findOne: jest.fn(),
  };
  const mockExecutionService = {
    runCode: jest.fn(),
  };
  const mockGamificationService = {
    awardXP: jest.fn().mockResolvedValue(10),
    checkAndAwardBadges: jest.fn().mockResolvedValue([]),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PracticeService(
      mockLessonRepo as any,
      mockExerciseRepo as any,
      mockLessonProgressRepo as any,
      mockCourseProgressRepo as any,
      mockPathProgressRepo as any,
      mockModuleRepo as any,
      mockLpcRepo as any,
      mockProblemRepo as any,
      mockExecutionService as any,
      mockGamificationService as any,
    );
  });

  it('sets the default duration to 30 seconds when module configuration is missing', async () => {
    mockLessonRepo.findOne.mockResolvedValue({
      id: 'lesson-1',
      title: 'Intro Lesson',
      exercises: [],
      module: {}, // No requiredTimeSeconds configured
    });
    mockLessonProgressRepo.findOne.mockResolvedValue({
      timeSpentSeconds: 10,
      status: 'in_progress',
    });

    const status = await service.checkLessonCompletion('lesson-1', 'student-1');

    expect(status.canComplete).toBe(false);
    expect(status.criteria.requiredTime).toBe(30); // 30-second global default
    expect(status.criteria.timeRemaining).toBe(20);
    expect(status.reasons[0]).toContain('You must spend at least 30 seconds');
  });

  it('preserves explicitly configured module duration', async () => {
    mockLessonRepo.findOne.mockResolvedValue({
      id: 'lesson-2',
      title: 'Advanced Lesson',
      exercises: [],
      module: {
        requiredTimeSeconds: 60,
      },
    });
    mockLessonProgressRepo.findOne.mockResolvedValue({
      timeSpentSeconds: 40,
      status: 'in_progress',
    });

    const status = await service.checkLessonCompletion('lesson-2', 'student-1');

    expect(status.canComplete).toBe(false);
    expect(status.criteria.requiredTime).toBe(60);
    expect(status.criteria.timeRemaining).toBe(20);
  });

  it('returns structured reasons on failure and permits completion when criteria are met', async () => {
    mockLessonRepo.findOne.mockResolvedValue({
      id: 'lesson-3',
      title: 'Quiz and Code Lesson',
      passingScore: 80,
      exercises: [
        { id: 'ex-1', type: 'quiz', isMandatory: true },
        { id: 'ex-2', type: 'coding', isMandatory: true },
      ],
      module: { requiredTimeSeconds: 30 },
    });
    mockLessonProgressRepo.findOne.mockResolvedValue({
      timeSpentSeconds: 5,
      status: 'in_progress',
    });

    // Attempting completion should fail and throw detailed BadRequestException
    await expect(
      service.completeLesson('lesson-3', 'student-1', 5),
    ).rejects.toThrow(BadRequestException);

    try {
      await service.completeLesson('lesson-3', 'student-1', 5);
    } catch (err: any) {
      const response = err.getResponse();
      expect(response.reasons.length).toBeGreaterThan(0);
      expect(response.criteria.timeMet).toBe(false);
      expect(response.criteria.quizMet).toBe(false);
      expect(response.criteria.codingMet).toBe(false);
    }

    // Now satisfy requirements
    mockLessonProgressRepo.findOne.mockResolvedValue({
      timeSpentSeconds: 35,
      status: 'completed',
    });
    const successStatus = await service.checkLessonCompletion('lesson-3', 'student-1', 35);
    expect(successStatus.canComplete).toBe(true);
    expect(successStatus.reasons).toEqual([]);
  });
});
