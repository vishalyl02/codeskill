jest.mock('@nestjs/typeorm', () => ({ InjectRepository: () => () => { } }));

import { AssessmentsService } from './assessments.service';

describe('AssessmentsService — 3-Mode Proctoring & Violation Penalties', () => {
  let service: AssessmentsService;
  let assessmentRepo: any;
  let attemptRepo: any;
  let questionRepo: any;
  let auditLogRepo: any;

  beforeEach(() => {
    assessmentRepo = {
      create: jest.fn((dto) => ({ ...dto, id: 'assessment-uuid-1' })),
      save: jest.fn(async (item) => item),
      findOne: jest.fn(),
      find: jest.fn(),
    };
    attemptRepo = {
      create: jest.fn((dto) => ({ ...dto, id: 'attempt-uuid-1' })),
      save: jest.fn(async (item) => item),
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
    };
    questionRepo = {
      find: jest.fn().mockResolvedValue([{ id: 'q-1', marks: 10 }]),
      count: jest.fn().mockResolvedValue(1),
      findByIds: jest.fn().mockResolvedValue([{ id: 'q-1', marks: 10 }]),
    };
    auditLogRepo = {
      create: jest.fn((item) => item),
      save: jest.fn(async (item) => item),
    };

    service = new AssessmentsService(
      assessmentRepo,
      attemptRepo,
      questionRepo,
      auditLogRepo,
    );
  });

  it('creates assessment with partial_proctored mode, manual submission, and configurable penalty marks', async () => {
    const created = await service.create(
      {
        title: 'Midterm Exam',
        code: 'MID-2026',
        durationMinutes: 60,
        sections: [
          {
            title: 'Section A',
            order: 0,
            questions: [{ questionId: 'q-1', marks: 10 }],
          },
        ],
        proctoring: {
          mode: 'partial_proctored',
          violationPenaltyMarks: 3.5,
          useCamera: true,
          enforceFullscreen: true,
          detectTabSwitch: true,
        },
      } as any,
      { id: 'admin-1' },
    );

    expect(created.mode).toBe('partial_proctored');
    expect(created.submissionPolicy).toBe('manual');
    expect(created.proctoring.autoSubmitOnViolation).toBe(false);
    expect(created.proctoring.violationPenaltyMarks).toBe(3.5);
    expect(created.proctoring.useCamera).toBe(true);
  });

  it('creates assessment with non_proctored mode and turns off restrictions', async () => {
    const created = await service.create(
      {
        title: 'Open Book Quiz',
        code: 'QUIZ-OPEN',
        durationMinutes: 30,
        sections: [
          {
            title: 'Section A',
            order: 0,
            questions: [{ questionId: 'q-1', marks: 10 }],
          },
        ],
        proctoring: {
          mode: 'non_proctored',
        },
      } as any,
      { id: 'admin-1' },
    );

    expect(created.mode).toBe('non_proctored');
    expect(created.submissionPolicy).toBe('manual');
    expect(created.proctoring.autoSubmitOnViolation).toBe(false);
    expect(created.proctoring.useCamera).toBe(false);
    expect(created.proctoring.enforceFullscreen).toBe(false);
    expect(created.proctoring.detectTabSwitch).toBe(false);
  });

  it('in partial_proctored mode, recordViolation does not auto-submit and calculates negative marks', async () => {
    const assessment = {
      id: 'assessment-uuid-1',
      code: 'MID-2026',
      proctoring: {
        mode: 'partial_proctored',
        autoSubmitOnViolation: false,
        violationPenaltyMarks: 2,
        maxTabSwitches: 3,
      },
    };
    const attempt = {
      id: 'attempt-uuid-1',
      assessmentId: 'assessment-uuid-1',
      studentId: 'student-1',
      status: 'in_progress',
      violations: [
        { type: 'tab_switch', warningIndex: 1 },
        { type: 'tab_switch', warningIndex: 2 },
        { type: 'tab_switch', warningIndex: 3 },
        { type: 'face_not_detected', warningIndex: 4 },
        { type: 'face_not_detected', warningIndex: 5 },
      ],
      tabSwitchCount: 3,
      proctoringPenalty: 10,
    };

    jest.spyOn(service, 'findAssessmentByIdOrCode').mockResolvedValue(assessment as any);
    attemptRepo.findOne.mockImplementation(async () => attempt);

    const result = await service.recordViolation(
      'assessment-uuid-1',
      { type: 'tab_switch', details: 'Switched tabs to browser window' },
      { id: 'student-1' },
    );

    // Violations now = 6. In partial_proctored mode, forceSubmit must be FALSE!
    expect(result.forceSubmit).toBe(false);
    expect(result.penaltyDeducted).toBe(2);
    expect(result.totalPenaltyMarks).toBe(12); // 6 * 2
    expect(attempt.proctoringPenalty).toBe(12);
    expect(attemptRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        proctoringPenalty: 12,
      }),
    );
  });

  it('in fully_proctored mode, recordViolation sets forceSubmit to true when face warnings reach limit', async () => {
    const assessment = {
      id: 'assessment-uuid-1',
      code: 'FINAL-2026',
      proctoring: {
        mode: 'fully_proctored',
        autoSubmitOnViolation: true,
        maxTabSwitches: 3,
      },
    };
    const attempt = {
      id: 'attempt-uuid-1',
      assessmentId: 'assessment-uuid-1',
      studentId: 'student-1',
      status: 'in_progress',
      violations: [
        { type: 'face_not_detected', warningIndex: 1 },
        { type: 'face_not_detected', warningIndex: 2 },
      ],
    };

    jest.spyOn(service, 'findAssessmentByIdOrCode').mockResolvedValue(assessment as any);
    attemptRepo.findOne.mockImplementation(async () => attempt);

    const result = await service.recordViolation(
      'assessment-uuid-1',
      { type: 'face_not_detected', details: 'No face detected' },
      { id: 'student-1' },
    );

    // 3rd face warning out of maxTabSwitches=3 -> forceSubmit is true
    expect(result.forceSubmit).toBe(true);
    expect(result.penaltyDeducted).toBe(0);
  });

  it('in partial_proctored mode, submitAttempt deducts penaltyMarks from rawScore', async () => {
    const assessment = {
      id: 'assessment-uuid-1',
      code: 'FINAL-2026',
      totalMarks: 20,
      passingMarks: 10,
      questions: ['q-1'],
      proctoring: {
        mode: 'partial_proctored',
        autoSubmitOnViolation: false,
        violationPenaltyMarks: 2.5,
      },
    };
    const attempt = {
      id: 'attempt-uuid-1',
      assessmentId: 'assessment-uuid-1',
      studentId: 'student-1',
      status: 'in_progress',
      violations: [
        { type: 'tab_switch' },
        { type: 'fullscreen_exit' },
      ],
    };

    jest.spyOn(service, 'findAssessmentByIdOrCode').mockResolvedValue(assessment as any);
    jest.spyOn(service as any, 'isStudentTargeted').mockReturnValue(true);
    attemptRepo.findOne.mockImplementation(async () => attempt);
    questionRepo.find.mockResolvedValue([
      {
        id: 'q-1',
        questionType: 'mcq',
        marks: 10,
        correctAnswer: 0,
      },
    ]);

    await (service as any).evaluateAttempt(
      'assessment-uuid-1',
      {
        responses: [{ questionId: 'q-1', selectedAnswer: 0 }],
        violations: [
          { type: 'tab_switch' },
          { type: 'fullscreen_exit' },
        ],
      },
      { id: 'student-1' },
    );

    // Raw score is 10. 2 violations * 2.5 penalty = 5 penalty. Final score = 10 - 5 = 5.
    expect(attempt.rawScore).toBe(10);
    expect(attempt.proctoringPenalty).toBe(5);
    expect(attempt.score).toBe(5);
    expect(attempt.submissionPolicy).toBe('manual');
    expect(attempt.mode).toBe('partial_proctored');
  });

  it('caps stored violations array at 100 to prevent JSONB document bloat (AUD-DAT-006)', async () => {
    const assessment = {
      id: 'assessment-uuid-1',
      code: 'CAP-TEST',
      proctoring: {
        mode: 'partial_proctored',
        autoSubmitOnViolation: false,
        violationPenaltyMarks: 1,
      },
    };
    // Pre-populate with 105 existing violations
    const initialViolations = Array.from({ length: 105 }, (_, i) => ({
      type: 'tab_switch',
      warningIndex: i + 1,
      timestamp: new Date(),
    }));
    const attempt = {
      id: 'attempt-uuid-1',
      assessmentId: 'assessment-uuid-1',
      studentId: 'student-1',
      status: 'in_progress',
      violations: initialViolations,
      tabSwitchCount: 105,
      proctoringPenalty: 105,
    };

    jest.spyOn(service, 'findAssessmentByIdOrCode').mockResolvedValue(assessment as any);
    attemptRepo.findOne.mockImplementation(async () => attempt);

    await service.recordViolation(
      'assessment-uuid-1',
      { type: 'tab_switch', details: 'Excessive violation' },
      { id: 'student-1' },
    );

    // Stored array must be capped at 100
    expect(attempt.violations.length).toBe(100);
    // Baseline first violation is preserved
    expect(attempt.violations[0].warningIndex).toBe(1);
    // Total penalty reflects true count (106 * 1 = 106)
    expect(attempt.proctoringPenalty).toBe(106);
  });

  it('caps stored captures array at 50 to prevent JSONB document bloat (AUD-DAT-006)', async () => {
    const assessment = {
      id: 'assessment-uuid-1',
      code: 'CAPTURE-CAP-TEST',
    };
    const initialCaptures = Array.from({ length: 55 }, (_, i) => ({
      type: 'webcam',
      url: `https://bucket.s3.amazonaws.com/proctoring/capture-${i}.jpg`,
      timestamp: new Date(),
    }));
    const attempt = {
      id: 'attempt-uuid-1',
      assessmentId: 'assessment-uuid-1',
      studentId: 'student-1',
      status: 'in_progress',
      captures: initialCaptures,
    };

    const mockS3Service = {
      uploadBase64Image: jest.fn().mockResolvedValue('https://bucket.s3.amazonaws.com/proctoring/capture-new.jpg'),
    };
    (service as any).s3Service = mockS3Service;

    jest.spyOn(service, 'findAssessmentByIdOrCode').mockResolvedValue(assessment as any);
    jest.spyOn(service as any, 'isStudentTargeted').mockReturnValue(true);
    attemptRepo.findOne.mockImplementation(async () => attempt);

    await service.recordProctorCapture(
      'assessment-uuid-1',
      { type: 'webcam', image: 'data:image/jpeg;base64,...' },
      { id: 'student-1' },
    );

    expect(attempt.captures.length).toBe(50);
  });
});
