import { PistonUnavailableError } from '../execution/piston/piston.types';
jest.mock('@nestjs/typeorm', () => ({ InjectRepository: () => () => { } }));

import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AssessmentsService } from './assessments.service';

describe('Assessment Integrity & Server-Side Scoring (AUD-002, NEW-001, NEW-002, NEW-003)', () => {
  let service: AssessmentsService;

  const mockAssessmentRepo = {
    findOne: jest.fn(),
  };
  const mockAttemptRepo = {
    create: jest.fn((attempt: any) => attempt),
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
  };
  const mockQuestionRepo = {
    find: jest.fn(),
  };
  const mockAuditLogRepo = {
    save: jest.fn(),
  };
  const mockExecutionService = {
    runCode: jest.fn(),
  };

  const studentUser = {
    id: 'candidate-uuid-1',
    name: 'Alice Student',
    email: 'alice@cu.edu',
    uid: 'CU1001',
  };

  const assessmentId = 'assessment-uuid-1';
  const mockAssessment = {
    id: assessmentId,
    title: 'Midterm Examination',
    status: 'published',
    questions: ['q-mcq-1', 'q-coding-1'],
    totalMarks: 10,
    passingMarks: 5,
    negativeMarking: false,
    endTime: new Date(Date.now() + 3600000), // 1 hour in future
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockAttemptRepo.save.mockImplementation((a) => Promise.resolve(a));

    service = new AssessmentsService(
      mockAssessmentRepo as never,
      mockAttemptRepo as never,
      mockQuestionRepo as never,
      mockAuditLogRepo as never,
      mockExecutionService as never,
      {
        reserve: jest.fn().mockResolvedValue('assessment-reservation'),
        claim: jest.fn().mockResolvedValue('claimed'),
        renew: jest.fn().mockResolvedValue(undefined),
        release: jest.fn().mockResolvedValue(undefined),
        heartbeatMs: 15000,
      } as never,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  const codingAttempt = () => {
    const now = Date.now();
    mockAssessmentRepo.findOne.mockResolvedValue({
      ...mockAssessment,
      endTime: new Date(now + 1000),
    });
    mockAttemptRepo.findOne.mockResolvedValue({
      id: 'attempt-1',
      assessmentId,
      studentId: studentUser.id,
      status: 'in_progress',
      startedAt: new Date(now - 1000),
    });
    mockAttemptRepo.find.mockResolvedValue([]);
    mockQuestionRepo.find.mockResolvedValue([
      {
        id: 'q-coding-1',
        questionType: 'coding',
        marks: 5,
        supportedLanguages: ['python'],
        testCases: [{ id: 'tc-1', input: '', expectedOutput: '2' }],
      },
    ]);
    return {
      responses: [
        { questionId: 'q-coding-1', code: 'print(2)', language: 'python' },
      ],
    };
  };

  it('does not finalize a zero-score result during Piston infrastructure failure', async () => {
    const dto = codingAttempt();
    mockExecutionService.runCode.mockRejectedValueOnce(
      new PistonUnavailableError(),
    );
    await expect(
      service.submitAttempt(assessmentId, dto as never, studentUser),
    ).rejects.toBeInstanceOf(PistonUnavailableError);
    expect(mockAttemptRepo.save).not.toHaveBeenCalled();
  });

  it('preserves acceptance time when execution finishes after the deadline', async () => {
    jest.useFakeTimers();
    try {
      const acceptedAt = new Date();
      const dto = codingAttempt();
      mockExecutionService.runCode.mockImplementationOnce(async () => {
        jest.setSystemTime(new Date(acceptedAt.getTime() + 2000));
        return [{ passed: true, status: 'accepted' }];
      });
      await service.submitAttempt(assessmentId, dto as never, studentUser);
      expect(mockAttemptRepo.save.mock.calls[0][0].submittedAt).toEqual(
        acceptedAt,
      );
      expect(mockAttemptRepo.save.mock.calls[0][0].score).toBe(5);
    } finally {
      jest.useRealTimers();
    }
  });

  it('rejects disallowed assessment languages before execution', async () => {
    const dto = codingAttempt();
    dto.responses[0].language = 'java';
    await expect(
      service.submitAttempt(assessmentId, dto as never, studentUser),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mockExecutionService.runCode).not.toHaveBeenCalled();
  });

  it('rejects submission if attempt does not belong to the calling candidate (NEW-001)', async () => {
    mockAssessmentRepo.findOne.mockResolvedValue(mockAssessment);
    mockAttemptRepo.findOne.mockResolvedValue({
      id: 'attempt-1',
      assessmentId,
      studentId: 'different-student-uuid', // Belongs to someone else!
      status: 'in_progress',
    });

    await expect(
      service.submitAttempt(assessmentId, { responses: [] }, studentUser),
    ).rejects.toThrow(ForbiddenException);

    expect(mockAttemptRepo.save).not.toHaveBeenCalled();
  });

  it('rejects submission if assessment end time has passed (NEW-002)', async () => {
    mockAssessmentRepo.findOne.mockResolvedValue({
      ...mockAssessment,
      endTime: new Date(Date.now() - 1000), // No new submissions after the deadline
    });
    mockAttemptRepo.findOne.mockResolvedValue({
      id: 'attempt-1',
      assessmentId,
      studentId: studentUser.id,
      status: 'in_progress',
    });

    await expect(
      service.submitAttempt(assessmentId, { responses: [] }, studentUser),
    ).rejects.toThrow(BadRequestException);

    expect(mockAttemptRepo.save).not.toHaveBeenCalled();
  });

  it('handles duplicate submissions idempotently without re-grading (NEW-003)', async () => {
    mockAssessmentRepo.findOne.mockResolvedValue(mockAssessment);
    mockAttemptRepo.findOne.mockResolvedValue({
      id: 'attempt-1',
      assessmentId,
      studentId: studentUser.id,
      status: 'submitted', // Already submitted
      score: 8,
      highestScore: 8,
      maxScore: 10,
      responses: [],
    });

    // Mock getStudentResult behavior when attempt is already submitted
    jest.spyOn(service, 'getStudentResult').mockResolvedValue({
      success: true,
      result: { score: 8, highestScore: 8 },
    } as never);

    const result = await service.submitAttempt(
      assessmentId,
      { responses: [] },
      studentUser,
    );

    expect(service.getStudentResult).toHaveBeenCalledWith(
      assessmentId,
      studentUser,
    );
    expect(mockAttemptRepo.save).not.toHaveBeenCalled();
  });

  it('ignores client-supplied test case numbers and calculates MCQ marks strictly server-side (AUD-002)', async () => {
    mockAssessmentRepo.findOne.mockResolvedValue(mockAssessment);
    mockAttemptRepo.findOne.mockResolvedValue({
      id: 'attempt-1',
      assessmentId,
      studentId: studentUser.id,
      status: 'in_progress',
      startedAt: new Date(Date.now() - 10000),
    });
    mockAttemptRepo.find.mockResolvedValue([]); // No previous attempts

    const questionsInDb = [
      {
        id: 'q-mcq-1',
        questionType: 'single_choice',
        correctAnswer: 1, // Option 1 is the ONLY correct answer
        marks: 5,
        negativeMarks: 1,
      },
      {
        id: 'q-coding-1',
        questionType: 'coding',
        marks: 5,
        testCases: [
          { id: 'tc-1', input: '1', expectedOutput: '2' },
          { id: 'tc-2', input: '2', expectedOutput: '4' },
        ],
      },
    ];
    mockQuestionRepo.find.mockResolvedValue(questionsInDb);

    // Mock ExecutionService returning 1 out of 2 passed for coding question
    mockExecutionService.runCode.mockResolvedValue([
      { id: 'tc-1', passed: true, status: 'accepted' },
      { id: 'tc-2', passed: false, status: 'wrong_answer' },
    ]);

    // Attacker payload claims full 100% on coding and wrong answer on MCQ with claimed correct flag
    const maliciousPayload = {
      responses: [
        {
          questionId: 'q-mcq-1',
          selectedAnswer: 3, // WRONG answer (correct is 1)
          // Maliciously forged properties:
          isCorrect: true,
          marksAwarded: 5,
        },
        {
          questionId: 'q-coding-1',
          code: 'def solution(x): return x * 2',
          language: 'python',
          // Malicious client claims 100/100 test cases passed:
          testCasesPassed: 100,
          totalTestCases: 100,
        },
      ],
      timeSpentSeconds: 300,
    };

    const response = await service.submitAttempt(
      assessmentId,
      maliciousPayload as never,
      studentUser,
    );

    expect(mockAttemptRepo.save).toHaveBeenCalled();
    const savedAttempt = mockAttemptRepo.save.mock.calls[0][0];

    // MCQ answer 3 was wrong, so marksAwarded = 0
    const mcqResponse = savedAttempt.responses.find(
      (r: any) => r.questionId === 'q-mcq-1',
    );
    expect(mcqResponse.isCorrect).toBe(false);
    expect(mcqResponse.marksAwarded).toBe(0);

    // Coding question: ExecutionService reported 1 out of 2 passed (50% of 5 marks = 2.5 marks)
    const codingResponse = savedAttempt.responses.find(
      (r: any) => r.questionId === 'q-coding-1',
    );
    expect(codingResponse.testCasesPassed).toBe(1);
    expect(codingResponse.totalTestCases).toBe(2);
    expect(codingResponse.marksAwarded).toBe(2.5);

    // Total score is strictly calculated from server evaluations (0 + 2.5 = 2.5)
    expect(savedAttempt.score).toBe(2.5);
    expect((response as any).result.score).toBe(2.5);
  });

  it('builds a 30/40/30 question mix from the bank when the attempt needs a balanced set', () => {
    const bank = [
      ...Array.from({ length: 10 }, (_, index) => ({ id: `easy-${index + 1}`, difficulty: 'easy' })),
      ...Array.from({ length: 10 }, (_, index) => ({ id: `medium-${index + 1}`, difficulty: 'medium' })),
      ...Array.from({ length: 10 }, (_, index) => ({ id: `hard-${index + 1}`, difficulty: 'hard' })),
    ] as any[];

    const selected = (service as any).buildDifficultyBalancedQuestionIds(bank, 10);
    const counts = { easy: 0, medium: 0, hard: 0 };

    selected.forEach((id: string) => {
      const question = bank.find((item) => item.id === id);
      if (question?.difficulty === 'easy') counts.easy += 1;
      if (question?.difficulty === 'medium') counts.medium += 1;
      if (question?.difficulty === 'hard') counts.hard += 1;
    });

    expect(selected).toHaveLength(10);
    expect(counts.easy).toBe(3);
    expect(counts.medium).toBe(4);
    expect(counts.hard).toBe(3);
  });

  it('keeps question and option order fixed per attempt while remapping selected answers to canonical indices', async () => {
    const seededRandom = [0.85, 0.15, 0.75, 0.25, 0.65, 0.35, 0.9, 0.1];
    const randomSpy = jest.spyOn(Math, 'random');
    seededRandom.forEach((value) => randomSpy.mockReturnValueOnce(value));

    mockAssessmentRepo.findOne.mockResolvedValue({
      ...mockAssessment,
      questions: ['q-mcq-1'],
      shuffleQuestions: true,
      shuffleOptions: true,
    });
    mockAttemptRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'attempt-1',
      assessmentId,
      studentId: studentUser.id,
      status: 'in_progress',
      startedAt: new Date(Date.now() - 10000),
      questionOrder: ['q-mcq-1'],
      responses: [{ questionId: 'q-mcq-1', selectedAnswer: -1, optionOrder: [1, 0, 2] }],
    });
    mockAttemptRepo.find.mockResolvedValue([]);
    mockQuestionRepo.find.mockResolvedValue([
      {
        id: 'q-mcq-1',
        questionType: 'single_choice',
        options: ['A', 'B', 'C'],
        correctAnswer: 1,
        marks: 5,
        negativeMarks: 0,
        topic: 'Math',
        difficulty: 'easy',
      },
    ]);

    const started = await service.startStudentAttempt(assessmentId, studentUser);
    const displayedQuestion = started.questions[0];
    expect(displayedQuestion.options).toEqual(['B', 'A', 'C']);

    const response = await service.submitAttempt(
      assessmentId,
      {
        responses: [{
          questionId: 'q-mcq-1',
          selectedAnswer: displayedQuestion.options.indexOf('B'),
        }],
      } as never,
      studentUser,
    );

    expect((response as any).result.score).toBe(5);
    const savedAttempt = mockAttemptRepo.save.mock.calls.at(-1)?.[0];
    const savedResponse = savedAttempt.responses.find((r: any) => r.questionId === 'q-mcq-1');
    expect(savedResponse.isCorrect).toBe(true);
    expect(savedResponse.marksAwarded).toBe(5);
    randomSpy.mockRestore();
  });

  it('creates a fresh option order for every new attempt without reusing the prior attempt ordering', async () => {
    const randomSpy = jest.spyOn(Math, 'random');
    randomSpy.mockReturnValueOnce(0.2).mockReturnValueOnce(0.8).mockReturnValueOnce(0.6)
      .mockReturnValueOnce(0.4).mockReturnValueOnce(0.9).mockReturnValueOnce(0.1)
      .mockReturnValueOnce(0.7).mockReturnValueOnce(0.3).mockReturnValueOnce(0.55)
      .mockReturnValueOnce(0.35).mockReturnValueOnce(0.65).mockReturnValueOnce(0.85);

    mockAssessmentRepo.findOne.mockResolvedValue({
      ...mockAssessment,
      questions: ['q-mcq-1'],
      shuffleOptions: true,
    });
    mockAttemptRepo.find.mockResolvedValue([]);
    mockQuestionRepo.find.mockResolvedValue([
      {
        id: 'q-mcq-1',
        questionType: 'single_choice',
        options: ['A', 'B', 'C'],
        correctAnswer: 1,
        marks: 5,
        negativeMarks: 0,
        topic: 'Math',
        difficulty: 'easy',
      },
    ]);

    mockAttemptRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    const firstAttempt = await service.startStudentAttempt(assessmentId, studentUser);
    const secondAttempt = await service.startStudentAttempt(assessmentId, studentUser);

    const firstOrder = firstAttempt.questions[0].options;
    const secondOrder = secondAttempt.questions[0].options;

    expect(firstOrder).toHaveLength(3);
    expect(secondOrder).toHaveLength(3);
    expect(new Set(firstOrder)).toEqual(new Set(['A', 'B', 'C']));
    expect(new Set(secondOrder)).toEqual(new Set(['A', 'B', 'C']));
    expect(firstOrder).not.toEqual(secondOrder);

    randomSpy.mockRestore();
  });

  it('reuses saved option order when resuming an existing attempt', async () => {
    mockAssessmentRepo.findOne.mockResolvedValue({ ...mockAssessment, shuffleOptions: true });
    mockAttemptRepo.findOne.mockResolvedValue({
      id: 'attempt-1', assessmentId, studentId: studentUser.id,
      status: 'in_progress', startedAt: new Date(), questionOrder: ['q-mcq-1'],
      responses: [{ questionId: 'q-mcq-1', selectedAnswer: 0, optionOrder: [2, 0, 1] }],
    });
    mockQuestionRepo.find.mockResolvedValue([
      { id: 'q-mcq-1', questionType: 'single_choice', options: ['A', 'B', 'C'] },
    ]);
    const randomSpy = jest.spyOn(Math, 'random');

    const resumed = await service.startStudentAttempt(assessmentId, studentUser);

    expect(resumed.questions[0].options).toEqual(['C', 'A', 'B']);
    expect(resumed.savedResponses[0].selectedAnswer).toBe(0);
    expect(randomSpy).not.toHaveBeenCalled();
    expect(mockAttemptRepo.save).not.toHaveBeenCalled();
  });

  it('grades shuffled multiple-choice answers using the stored order, ignoring client mappings', async () => {
    mockAssessmentRepo.findOne.mockResolvedValue(mockAssessment);
    mockAttemptRepo.findOne.mockResolvedValue({
      id: 'attempt-1', assessmentId, studentId: studentUser.id,
      status: 'in_progress', startedAt: new Date(),
      responses: [{ questionId: 'q-mcq-1', optionOrder: [2, 0, 1] }],
    });
    mockAttemptRepo.find.mockResolvedValue([]);
    mockQuestionRepo.find.mockResolvedValue([
      { id: 'q-mcq-1', questionType: 'multiple_choice', correctAnswers: [1, 2], marks: 5 },
    ]);

    const submitted = await service.submitAttempt(assessmentId, {
      responses: [{ questionId: 'q-mcq-1', selectedAnswers: [0, 2], optionOrder: [0, 1, 2] }],
    } as never, studentUser);

    expect(submitted.result.score).toBe(5);
    const savedResponse = mockAttemptRepo.save.mock.calls.at(-1)?.[0].responses[0];
    expect(savedResponse.isCorrect).toBe(true);
    expect(savedResponse.selectedAnswers).toEqual([2, 1]);
    expect(savedResponse.optionOrder).toEqual([2, 0, 1]);
  });

  it('keeps server option mappings across partial progress saves', async () => {
    mockAssessmentRepo.findOne.mockResolvedValue(mockAssessment);
    const attempt = {
      id: 'attempt-1', assessmentId, studentId: studentUser.id, status: 'in_progress',
      responses: [
        { questionId: 'q-mcq-1', selectedAnswer: -1, optionOrder: [1, 0, 2] },
        { questionId: 'q-mcq-2', selectedAnswer: -1, optionOrder: [2, 0, 1] },
      ],
    };
    mockAttemptRepo.findOne.mockResolvedValue(attempt);

    await service.saveProgress(assessmentId, {
      responses: [{ questionId: 'q-mcq-1', selectedAnswer: 0, optionOrder: [0, 1, 2] }],
    } as never, studentUser);

    expect(attempt.responses).toEqual(expect.arrayContaining([
      expect.objectContaining({ questionId: 'q-mcq-1', selectedAnswer: 0, optionOrder: [1, 0, 2] }),
      expect.objectContaining({ questionId: 'q-mcq-2', selectedAnswer: -1, optionOrder: [2, 0, 1] }),
    ]));
  });
});
