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
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    count: jest.fn().mockResolvedValue(1),
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

  it('rejects duplicate answers before executing code or saving a score', async () => {
    const dto = codingAttempt();
    dto.responses.push({ ...dto.responses[0] });
    await expect(service.submitAttempt(assessmentId, dto as never, studentUser))
      .rejects.toThrow('Duplicate question responses');
    expect(mockExecutionService.runCode).not.toHaveBeenCalled();
    expect(mockAttemptRepo.save).not.toHaveBeenCalled();
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

  it('allows three resumes of the same attempt and rejects the fourth', async () => {
    mockAssessmentRepo.findOne.mockResolvedValue({ ...mockAssessment, durationMinutes: 60 });
    const activeAttempt = {
      id: 'attempt-1', assessmentId, studentId: studentUser.id,
      status: 'in_progress', startedAt: new Date(), questionOrder: [], responses: [], resumeCount: 0,
    };
    mockAttemptRepo.findOne.mockImplementation(async () => activeAttempt);
    mockAttemptRepo.update.mockImplementation(async () => {
      activeAttempt.resumeCount += 1;
      return { affected: 1 };
    });
    mockQuestionRepo.find.mockResolvedValue([]);

    for (let remaining = 2; remaining >= 0; remaining--) {
      const result = await service.startStudentAttempt(assessmentId, studentUser);
      expect(result.resumeAttemptsRemaining).toBe(remaining);
      expect(result.startedAt).toBe(activeAttempt.startedAt);
    }
    await expect(service.startStudentAttempt(assessmentId, studentUser))
      .rejects.toThrow('All 3 resume opportunities have been used');
    expect(mockAttemptRepo.update).toHaveBeenCalledTimes(3);
  });

  it('does not resume an attempt after its original timer expires', async () => {
    mockAssessmentRepo.findOne.mockResolvedValue({ ...mockAssessment, durationMinutes: 60 });
    mockAttemptRepo.findOne.mockResolvedValue({
      id: 'attempt-1', assessmentId, studentId: studentUser.id,
      status: 'in_progress', startedAt: new Date(Date.now() - 61 * 60_000), resumeCount: 0,
    });
    mockQuestionRepo.find.mockResolvedValue([]);

    await expect(service.startStudentAttempt(assessmentId, studentUser))
      .rejects.toThrow('run out of time');
    expect(mockAttemptRepo.update).not.toHaveBeenCalled();
  });

  it('does not let retake replace an in-progress attempt', async () => {
    mockAssessmentRepo.findOne.mockResolvedValue(mockAssessment);
    mockAttemptRepo.findOne.mockResolvedValue({ id: 'attempt-1', status: 'in_progress' });

    await expect(service.retakeStudentAttempt(assessmentId, studentUser))
      .rejects.toThrow('already in progress');
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

  it('rejects duplicate question responses in submission with BadRequestException (AUD-002)', async () => {
    mockAssessmentRepo.findOne.mockResolvedValue(mockAssessment);
    mockAttemptRepo.findOne.mockResolvedValue({
      id: 'attempt-1',
      assessmentId,
      studentId: studentUser.id,
      status: 'in_progress',
      startedAt: new Date(),
    });
    mockQuestionRepo.find.mockResolvedValue([
      {
        id: 'q-mcq-1',
        questionType: 'single_choice',
        marks: 5,
        correctAnswer: 0,
      },
    ]);

    await expect(
      service.submitAttempt(
        assessmentId,
        {
          responses: [
            { questionId: 'q-mcq-1', selectedAnswer: 0 },
            { questionId: 'q-mcq-1', selectedAnswer: 0 },
          ],
        } as never,
        studentUser,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('reverts attempt status from evaluating back to in_progress on code execution failure (ISSUE-DAT-001)', async () => {
    const dto = codingAttempt();
    mockExecutionService.runCode.mockRejectedValueOnce(
      new PistonUnavailableError(),
    );
    await expect(
      service.submitAttempt(assessmentId, dto as never, studentUser),
    ).rejects.toBeInstanceOf(PistonUnavailableError);
    // Verified that update was called to revert status to in_progress
    expect(mockAttemptRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'attempt-1', status: 'evaluating' }),
      expect.objectContaining({ status: 'in_progress' }),
    );
  });

  it('reclaims stale evaluating attempt when evaluation lease expires (>60s) (ISSUE-DAT-001)', async () => {
    const staleDate = new Date(Date.now() - 75_000); // 75 seconds ago
    mockAttemptRepo.findOne.mockResolvedValueOnce({
      id: 'attempt-stale-1',
      assessmentId,
      studentId: studentUser.id,
      status: 'evaluating',
      startedAt: staleDate,
      updatedAt: staleDate,
    });
    mockQuestionRepo.find.mockResolvedValueOnce([
      {
        id: 'q-mcq-1',
        questionType: 'single_choice',
        marks: 5,
        correctAnswer: 0,
      },
    ]);
    const response = await service.submitAttempt(
      assessmentId,
      {
        responses: [{ questionId: 'q-mcq-1', selectedAnswer: 0 }],
      } as never,
      studentUser,
    );
    expect(response.success).toBe(true);
    expect(mockAttemptRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'attempt-stale-1', status: 'evaluating' }),
      expect.objectContaining({ status: 'in_progress' }),
    );
  });

  it('delivers normalized starter code and supported languages to students for coding questions', async () => {
    mockAssessmentRepo.findOne.mockResolvedValue({
      ...mockAssessment,
      questions: ['q-code-array', 'q-code-map'],
    });
    mockAttemptRepo.findOne.mockResolvedValue(null);
    mockAttemptRepo.find.mockResolvedValue([]);
    mockQuestionRepo.find.mockResolvedValue([
      {
        id: 'q-code-array',
        questionType: 'coding',
        question: 'Array Starter Code Problem',
        language: 'cpp',
        supportedLanguages: ['cpp', 'java'],
        starterCode: [
          { language: 'cpp', code: '// CPP Starter Code' },
          { language: 'java', code: '// Java Starter Code' },
        ],
        marks: 10,
        testCases: [{ input: '1', output: '1', isHidden: false }],
      },
      {
        id: 'q-code-map',
        questionType: 'coding',
        question: 'Map Starter Code Problem',
        starterCode: {
          python: '# Python Map Starter',
          javascript: '// JS Map Starter',
        },
        marks: 10,
        testCases: [{ input: '2', output: '2', isHidden: false }],
      },
    ]);

    const result = await service.startStudentAttempt(assessmentId, studentUser);
    expect(result.success).toBe(true);
    expect(result.questions).toHaveLength(2);

    // First question (array format with explicit supportedLanguages)
    const q1 = result.questions.find((q: any) => q.id === 'q-code-array');
    expect(q1.supportedLanguages).toEqual(['cpp', 'java']);
    expect(q1.language).toBe('cpp');
    expect(q1.starterCode).toEqual([
      { language: 'cpp', code: '// CPP Starter Code' },
      { language: 'java', code: '// Java Starter Code' },
    ]);

    // Second question (object map format with inferred supportedLanguages)
    const q2 = result.questions.find((q: any) => q.id === 'q-code-map');
    expect(q2.supportedLanguages).toEqual(['python', 'javascript']);
    expect(q2.language).toBe('python');
    expect(q2.starterCode).toEqual([
      { language: 'python', code: '# Python Map Starter' },
      { language: 'javascript', code: '// JS Map Starter' },
    ]);
  });

  it('keeps questions segregated by section so shuffling stays strictly within each section', async () => {
    mockAssessmentRepo.findOne.mockResolvedValue({
      ...mockAssessment,
      shuffleQuestions: true,
      questions: ['q-m1', 'q-m2', 'q-c1', 'q-c2'],
      sections: [
        {
          title: 'Section A - MCQs',
          order: 0,
          questions: [{ questionId: 'q-m1' }, { questionId: 'q-m2' }],
        },
        {
          title: 'Section B - Coding',
          order: 1,
          questions: [{ questionId: 'q-c1' }, { questionId: 'q-c2' }],
        },
      ],
    });
    mockAttemptRepo.findOne.mockResolvedValue(null);
    mockAttemptRepo.find.mockResolvedValue([]);
    mockQuestionRepo.find.mockResolvedValue([
      { id: 'q-m1', questionType: 'MCQ', options: ['A', 'B'], question: 'MCQ 1' },
      { id: 'q-m2', questionType: 'MCQ', options: ['C', 'D'], question: 'MCQ 2' },
      { id: 'q-c1', questionType: 'coding', options: [], question: 'Code 1', starterCode: 'print(1)' },
      { id: 'q-c2', questionType: 'coding', options: [], question: 'Code 2', starterCode: 'print(2)' },
    ]);

    const result = await service.startStudentAttempt(assessmentId, studentUser);
    expect(result.success).toBe(true);
    expect(result.questions).toHaveLength(4);

    const qIds = result.questions.map((q: any) => q.id);
    // Section A questions must be first 2 questions
    expect(qIds.slice(0, 2).sort()).toEqual(['q-m1', 'q-m2']);
    // Section B questions must be last 2 questions
    expect(qIds.slice(2, 4).sort()).toEqual(['q-c1', 'q-c2']);

    // Check section labels
    expect(result.questions[0].sectionTitle).toBe('Section A - MCQs');
    expect(result.questions[1].sectionTitle).toBe('Section A - MCQs');
    expect(result.questions[2].sectionTitle).toBe('Section B - Coding');
    expect(result.questions[3].sectionTitle).toBe('Section B - Coding');
  });

  it('automatically segregates MCQs and Coding questions into separate sections when explicit sections are omitted', async () => {
    mockAssessmentRepo.findOne.mockResolvedValue({
      ...mockAssessment,
      shuffleQuestions: true,
      questions: ['q-mcq-1', 'q-code-1', 'q-mcq-2', 'q-code-2'],
      sections: [],
    });
    mockAttemptRepo.findOne.mockResolvedValue(null);
    mockAttemptRepo.find.mockResolvedValue([]);
    mockQuestionRepo.find.mockResolvedValue([
      { id: 'q-mcq-1', questionType: 'MCQ', options: ['A', 'B'], question: 'MCQ 1' },
      { id: 'q-mcq-2', questionType: 'MCQ', options: ['C', 'D'], question: 'MCQ 2' },
      { id: 'q-code-1', questionType: 'coding', options: [], question: 'Code 1', starterCode: 'def solve(): pass' },
      { id: 'q-code-2', questionType: 'coding', options: [], question: 'Code 2', starterCode: 'def test(): pass' },
    ]);

    const result = await service.startStudentAttempt(assessmentId, studentUser);
    expect(result.success).toBe(true);
    expect(result.questions).toHaveLength(4);

    const qIds = result.questions.map((q: any) => q.id);
    // MCQ questions must be the first 2
    expect(qIds.slice(0, 2).sort()).toEqual(['q-mcq-1', 'q-mcq-2']);
    // Coding questions must be the last 2
    expect(qIds.slice(2, 4).sort()).toEqual(['q-code-1', 'q-code-2']);

    expect(result.questions[0].sectionTitle).toBe('Multiple Choice Questions');
    expect(result.questions[1].sectionTitle).toBe('Multiple Choice Questions');
    expect(result.questions[2].sectionTitle).toBe('Coding Challenges');
    expect(result.questions[3].sectionTitle).toBe('Coding Challenges');
  });

  describe('Overdue Attempt Auto-Finalization (Auto-submit on timeout)', () => {
    it('correctly identifies expired attempts via isAttemptExpired', () => {
      const liveAssessment = { ...mockAssessment, durationMinutes: 60, endTime: new Date(Date.now() + 3600_000) };
      const expiredByEndTime = { ...mockAssessment, durationMinutes: 60, endTime: new Date(Date.now() - 1000) };

      const activeAttempt = {
        id: 'att-1',
        status: 'in_progress' as const,
        startedAt: new Date(Date.now() - 30 * 60_000), // 30 mins ago of 60 min test
      };
      const overdueAttempt = {
        id: 'att-2',
        status: 'in_progress' as const,
        startedAt: new Date(Date.now() - 65 * 60_000), // 65 mins ago of 60 min test
      };
      const alreadySubmitted = {
        id: 'att-3',
        status: 'submitted' as const,
        startedAt: new Date(Date.now() - 70 * 60_000),
      };

      expect(service.isAttemptExpired(liveAssessment as any, activeAttempt as any)).toBe(false);
      expect(service.isAttemptExpired(liveAssessment as any, overdueAttempt as any)).toBe(true);
      expect(service.isAttemptExpired(expiredByEndTime as any, activeAttempt as any)).toBe(true);
      expect(service.isAttemptExpired(liveAssessment as any, alreadySubmitted as any)).toBe(false);
    });

    it('autoFinalizeAttempt grades saved MCQ responses and marks attempt timed_out', async () => {
      const assessment = {
        ...mockAssessment,
        totalMarks: 10,
        passingMarks: 5,
        questions: ['q1', 'q2'],
      };
      mockQuestionRepo.find.mockResolvedValue([
        { id: 'q1', questionType: 'MCQ', correctAnswer: 1, marks: 5 },
        { id: 'q2', questionType: 'MCQ', correctAnswer: 0, marks: 5 },
      ]);
      mockAttemptRepo.find.mockResolvedValue([]);
      mockAttemptRepo.update.mockResolvedValue({ affected: 1 });
      mockAttemptRepo.save.mockImplementation(async (att) => att);

      const attempt = {
        id: 'attempt-overdue-1',
        assessmentId: assessment.id,
        studentId: studentUser.id,
        status: 'in_progress',
        startedAt: new Date(Date.now() - 90 * 60_000),
        timeSpentSeconds: 1200,
        responses: [
          { questionId: 'q1', selectedAnswer: 1, timeSpentSeconds: 600 }, // correct -> 5 marks
          { questionId: 'q2', selectedAnswer: 2, timeSpentSeconds: 600 }, // wrong -> 0 marks
        ],
        violations: [],
      };

      const finalized = await service.autoFinalizeAttempt(assessment as any, attempt as any, 'timed_out');
      expect(finalized.status).toBe('timed_out');
      expect(finalized.score).toBe(5);
      expect(finalized.passed).toBe(true);
      expect(finalized.percentage).toBe(50);
      expect(finalized.submissionPolicy).toBe('auto');
      expect(mockAttemptRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'timed_out',
          score: 5,
        }),
      );
    });

    it('getStudentResult auto-finalizes an expired in_progress attempt and returns scorecard', async () => {
      const assessment = {
        ...mockAssessment,
        id: 'assessment-overdue',
        durationMinutes: 45,
        totalMarks: 10,
        passingMarks: 5,
        questions: ['q1'],
      };
      mockAssessmentRepo.findOne.mockResolvedValue(assessment);
      // First findOne for completed attempts returns null, second for in_progress returns the expired attempt
      mockAttemptRepo.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'attempt-overdue-2',
          assessmentId: assessment.id,
          studentId: studentUser.id,
          status: 'in_progress',
          startedAt: new Date(Date.now() - 50 * 60_000), // 50 mins ago for 45 min test
          responses: [{ questionId: 'q1', selectedAnswer: 2 }],
          violations: [],
        });
      mockQuestionRepo.find.mockResolvedValue([
        { id: 'q1', questionType: 'MCQ', correctAnswer: 2, marks: 10, topic: 'Math' },
      ]);
      mockAttemptRepo.update.mockResolvedValue({ affected: 1 });
      mockAttemptRepo.save.mockImplementation(async (att) => att);
      mockAttemptRepo.count.mockResolvedValue(1);

      const result = await service.getStudentResult(assessment.id, studentUser);
      expect(result.success).toBe(true);
      expect(result.attempt.status).toBe('timed_out');
      expect(result.attempt.score).toBe(10);
      expect(result.attempt.passed).toBe(true);
    });

    it('getAssessmentResults auto-finalizes overdue in_progress attempts and counts them in submitted stats', async () => {
      const assessment = {
        ...mockAssessment,
        id: 'assessment-admin-results',
        durationMinutes: 30,
        totalMarks: 10,
        passingMarks: 5,
        questions: ['q1'],
      };
      mockAssessmentRepo.findOne.mockResolvedValue(assessment);

      const overdueAttempt = {
        id: 'attempt-overdue-3',
        assessmentId: assessment.id,
        studentId: studentUser.id,
        studentName: 'Alice',
        status: 'in_progress',
        startedAt: new Date(Date.now() - 40 * 60_000), // 40 mins ago for 30 min test
        responses: [{ questionId: 'q1', selectedAnswer: 0 }],
        violations: [],
      };
      mockAttemptRepo.find.mockResolvedValueOnce([overdueAttempt]);
      mockQuestionRepo.find.mockResolvedValue([
        { id: 'q1', questionType: 'MCQ', correctAnswer: 0, marks: 10 },
      ]);
      mockAttemptRepo.update.mockResolvedValue({ affected: 1 });
      mockAttemptRepo.save.mockImplementation(async (att) => att);

      const res = await service.getAssessmentResults(assessment.id, { role: 'admin' });
      expect(res.success).toBe(true);
      expect(res.stats.totalSubmissionsCount).toBe(1);
      expect(res.stats.submittedCount).toBe(1);
      expect(res.attempts[0].status).toBe('timed_out');
      expect(res.attempts[0].score).toBe(10);
    });

    it('getStudentAssessmentOverview auto-finalizes overdue in_progress attempt and reflects timed_out', async () => {
      const assessment = {
        ...mockAssessment,
        id: 'assessment-overview-test',
        durationMinutes: 30,
        totalMarks: 10,
        questions: ['q1'],
      };
      mockAssessmentRepo.findOne.mockResolvedValue(assessment);

      const overdueAttempt = {
        id: 'attempt-overview-1',
        assessmentId: assessment.id,
        studentId: studentUser.id,
        status: 'in_progress',
        startedAt: new Date(Date.now() - 45 * 60_000),
        responses: [{ questionId: 'q1', selectedAnswer: -1 }],
        violations: [],
      };
      mockAttemptRepo.find.mockResolvedValue([overdueAttempt]);
      mockQuestionRepo.find.mockResolvedValue([
        { id: 'q1', questionType: 'MCQ', correctAnswer: 0, marks: 10 },
      ]);
      mockAttemptRepo.update.mockResolvedValue({ affected: 1 });
      mockAttemptRepo.save.mockImplementation(async (att) => att);

      const overview = await service.getStudentAssessmentOverview(assessment.id, studentUser);
      expect(overview.success).toBe(true);
      expect(overview.attempt.status).toBe('timed_out');
      expect(overview.completedAttemptsCount).toBe(1);
    });
  });
});