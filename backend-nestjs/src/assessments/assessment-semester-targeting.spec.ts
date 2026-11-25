jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AssessmentsService } from './assessments.service';

function createMockService(overrides: {
  assessments?: any[];
  attempts?: any[];
  questions?: any[];
  users?: any[];
} = {}) {
  const assessments = overrides.assessments || [];
  const attempts = overrides.attempts || [];
  const questions = overrides.questions || [];
  const users = overrides.users || [];

  const builder = {
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(assessments),
  };

  const userBuilder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(users),
  };
  const userRepo: any = {
    createQueryBuilder: () => userBuilder,
  };

  const assessmentRepo: any = {
    createQueryBuilder: () => builder,
    findOne: jest.fn().mockImplementation(async (query: any) => {
      const id = query.where?.[0]?.id || query.where?.[1]?.mongoId || query.where?.id;
      return assessments.find((a) => a.id === id || a.mongoId === id) || null;
    }),
    save: jest.fn().mockImplementation(async (a: any) => a),
    create: jest.fn().mockImplementation((a: any) => ({ ...a, id: 'created-id' })),
  };

  const attemptRepo: any = {
    find: jest.fn().mockImplementation(async () => attempts),
    count: jest.fn().mockImplementation(async () => attempts.length),
    findOne: jest.fn().mockImplementation(async (query: any) => {
      const cond = Array.isArray(query.where) ? query.where[0] : query.where;
      return (
        attempts.find(
          (att) =>
            (!cond.assessmentId || att.assessmentId === cond.assessmentId) &&
            (!cond.studentId || att.studentId === cond.studentId) &&
            (!cond.status || att.status === cond.status || (cond.status?._value && cond.status._value.includes(att.status))),
        ) || null
      );
    }),
    save: jest.fn().mockImplementation(async (att: any) => att),
    update: jest.fn().mockImplementation(async (criteria: any, patch: any) => {
      const att = attempts.find((item) => !criteria.id || item.id === criteria.id);
      if (!att) return { affected: 0 };
      if (criteria.currentQuestionIndex !== undefined
        && att.currentQuestionIndex !== criteria.currentQuestionIndex) return { affected: 0 };
      if (criteria.navigationVersion !== undefined
        && (att.navigationVersion || 0) !== criteria.navigationVersion) return { affected: 0 };
      for (const [key, value] of Object.entries(patch)) {
        att[key] = typeof value === 'function' ? (Number(att[key] || 0) + 1) : value;
      }
      return { affected: 1 };
    }),
    create: jest.fn().mockImplementation((att: any) => ({ ...att, id: 'att-created' })),
  };

  const questionRepo: any = {
    find: jest.fn().mockResolvedValue(questions),
    findOne: jest.fn().mockImplementation(async ({ where }: any) => {
      const conditions = Array.isArray(where) ? where : [where];
      return questions.find((q) => conditions.some((condition: any) =>
        q.id === condition?.id
        || (condition?.mongoId !== undefined && q.mongoId === condition.mongoId),
      )) || null;
    }),
  };

  const auditLogRepo: any = {
    create: jest.fn().mockImplementation((x) => x),
    save: jest.fn().mockResolvedValue(undefined),
  };

  const service = new AssessmentsService(
    assessmentRepo,
    attemptRepo,
    questionRepo,
    auditLogRepo,
    undefined,
    undefined,
    undefined,
    undefined,
    userRepo,
  );

  return { service, assessmentRepo, attemptRepo, questionRepo, auditLogRepo, userRepo, builder };
}

describe('Semester-Wise Assessment System: Targeting & Access Control', () => {
  const sem4Assessment: any = {
    id: 'sem4-exam',
    title: 'Operating Systems & Concurrency',
    code: 'CS401',
    status: 'published',
    durationMinutes: 60,
    totalMarks: 50,
    allowedAttempts: 1,
    targetSemesters: ['4'],
    targetBatches: ['2026'],
    targetDepartments: ['Computer Science'],
    targetSections: ['CSE-A'],
    targetGroups: ['A'],
    questions: ['q1'],
    created_by_id: 'faculty-alice',
  };

  const multiSemAssessment: any = {
    id: 'multi-sem-exam',
    title: 'Inter-Semester Coding Contest',
    code: 'CONTEST2026',
    status: 'published',
    durationMinutes: 90,
    totalMarks: 100,
    allowedAttempts: 1,
    targetSemesters: ['3', '4', '5'],
    questions: ['q1'],
    created_by_id: 'faculty-alice',
  };

  const openAssessment: any = {
    id: 'open-exam',
    title: 'General Coding Practice',
    code: 'GEN101',
    status: 'published',
    durationMinutes: 45,
    totalMarks: 30,
    allowedAttempts: 0,
    targetSemesters: [],
    questions: ['q1'],
    created_by_id: 'faculty-bob',
  };

  const eligibleStudent = {
    id: 'student-sem-4',
    name: 'Eligible Student',
    email: 'sem4@university.edu',
    studentProfile: {
      semester: 4,
      year: 2,
      section: 'CSE-A',
      group: 'A',
      batch: '2026',
      department: 'Computer Science',
    },
  };

  const wrongSemesterStudent = {
    id: 'student-sem-6',
    name: 'Wrong Semester Student',
    email: 'sem6@university.edu',
    studentProfile: {
      semester: 6,
      year: 3,
      section: 'CSE-A',
      group: 'A',
      batch: '2026',
      department: 'Computer Science',
    },
  };

  const wrongSectionStudent = {
    id: 'student-wrong-sec',
    name: 'Wrong Section Student',
    email: 'secb@university.edu',
    studentProfile: {
      semester: 4,
      year: 2,
      section: 'CSE-B',
      group: 'A',
      batch: '2026',
      department: 'Computer Science',
    },
  };

  const wrongGroupStudent = {
    id: 'student-wrong-group',
    name: 'Wrong Group Student',
    email: 'groupb@university.edu',
    studentProfile: {
      semester: 4,
      year: 2,
      section: 'CSE-A',
      group: 'B',
      batch: '2026',
      department: 'Computer Science',
    },
  };

  const unassignedStudent = {
    id: 'student-unassigned',
    name: 'Unassigned Student',
    email: 'unassigned@university.edu',
    studentProfile: {},
  };

  describe('Student Dashboard Visibility (getStudentAssessments)', () => {
    it('returns only assessments matching the student semester and cohort restrictions', async () => {
      const { service } = createMockService({
        assessments: [sem4Assessment, multiSemAssessment, openAssessment],
        questions: [{ id: 'q1', questionType: 'MCQ', difficulty: 'medium' }],
      });

      const resEligible = await service.getStudentAssessments(eligibleStudent);
      const resWrongSem = await service.getStudentAssessments(wrongSemesterStudent);
      const resUnassigned = await service.getStudentAssessments(unassignedStudent);

      // Eligible student (Semester 4, CSE-A, Group A, Batch 2026) sees all 3
      expect(resEligible.assessments.map((a) => a.id)).toEqual([
        'sem4-exam',
        'multi-sem-exam',
        'open-exam',
      ]);

      // Semester 6 student should NOT see Semester 4 exam, but sees open and (if included) not sem4
      expect(resWrongSem.assessments.map((a) => a.id)).toEqual(['open-exam']);

      // Unassigned student sees open assessments with no semester restrictions
      expect(resUnassigned.assessments.map((a) => a.id)).toEqual(['open-exam']);
    });
  });

  describe('Direct ID/URL Access Denied for Cross-Semester Students', () => {
    it('allows eligible student to view overview, start attempt, and get results', async () => {
      const attempt = {
        id: 'attempt-1',
        assessmentId: sem4Assessment.id,
        studentId: eligibleStudent.id,
        status: 'in_progress',
        startedAt: new Date(),
        score: 0,
      };
      const { service } = createMockService({
        assessments: [sem4Assessment],
        attempts: [attempt],
        questions: [{ id: 'q1', marks: 10, questionType: 'MCQ' }],
      });

      const overview = await service.getStudentAssessmentOverview('sem4-exam', eligibleStudent);
      expect(overview.success).toBe(true);
      expect(overview.assessment.id).toBe('sem4-exam');
    });

    it('denies student in different semester from accessing overview via direct ID/slug', async () => {
      const { service } = createMockService({ assessments: [sem4Assessment] });

      await expect(
        service.getStudentAssessmentOverview('sem4-exam', wrongSemesterStudent),
      ).rejects.toThrow(ForbiddenException);
    });

    it('denies student in different semester from starting an attempt session', async () => {
      const { service } = createMockService({ assessments: [sem4Assessment] });

      await expect(
        service.startStudentAttempt('sem4-exam', wrongSemesterStudent),
      ).rejects.toThrow(ForbiddenException);
    });

    it('denies student in different semester from retaking an attempt session', async () => {
      const { service } = createMockService({ assessments: [sem4Assessment] });

      await expect(
        service.retakeStudentAttempt('sem4-exam', wrongSemesterStudent),
      ).rejects.toThrow(ForbiddenException);
    });

    it('denies student in different semester from saving progress (autosave)', async () => {
      const { service } = createMockService({ assessments: [sem4Assessment] });

      await expect(
        service.saveProgress('sem4-exam', { responses: [] }, wrongSemesterStudent),
      ).rejects.toThrow(ForbiddenException);
    });

    it('denies student in different semester from submitting an attempt', async () => {
      const { service } = createMockService({ assessments: [sem4Assessment] });

      await expect(
        service.submitAttempt('sem4-exam', { responses: [] }, wrongSemesterStudent),
      ).rejects.toThrow(ForbiddenException);
    });

    it('denies student in different semester from viewing results/scorecard', async () => {
      const { service } = createMockService({ assessments: [sem4Assessment] });

      await expect(
        service.getStudentResult('sem4-exam', wrongSemesterStudent),
      ).rejects.toThrow(ForbiddenException);
    });

    it('denies student in different semester from proctoring verification and telemetry', async () => {
      const { service } = createMockService({ assessments: [sem4Assessment] });

      await expect(
        service.verifyIdentity('sem4-exam', {}, wrongSemesterStudent),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.recordViolation('sem4-exam', { type: 'tab_switch' }, wrongSemesterStudent),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.recordProctorCapture('sem4-exam', { type: 'webcam', image: 'base64' }, wrongSemesterStudent),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Multi-Semester Matching & String/Number Normalization', () => {
    it('allows students in any of the targeted semesters (e.g. Semesters 3, 4, 5)', async () => {
      const studentSem3 = {
        id: 's3',
        studentProfile: { semester: '3' },
      };
      const studentSem5 = {
        id: 's5',
        studentProfile: { semester: 'Semester 5' },
      };
      const studentSem2 = {
        id: 's2',
        studentProfile: { semester: 2 },
      };

      const { service } = createMockService({ assessments: [multiSemAssessment] });

      const overview3 = await service.getStudentAssessmentOverview('multi-sem-exam', studentSem3);
      expect(overview3.assessment.id).toBe('multi-sem-exam');

      const overview5 = await service.getStudentAssessmentOverview('multi-sem-exam', studentSem5);
      expect(overview5.assessment.id).toBe('multi-sem-exam');

      await expect(
        service.getStudentAssessmentOverview('multi-sem-exam', studentSem2),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Section, Group, Batch, and Department Restrictions', () => {
    it('enforces section restriction when semester matches', async () => {
      const { service } = createMockService({ assessments: [sem4Assessment] });

      await expect(
        service.getStudentAssessmentOverview('sem4-exam', wrongSectionStudent),
      ).rejects.toThrow(ForbiddenException);
    });

    it('enforces group restriction when semester and section match', async () => {
      const { service } = createMockService({ assessments: [sem4Assessment] });

      await expect(
        service.getStudentAssessmentOverview('sem4-exam', wrongGroupStudent),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Faculty Authorization Scope', () => {
    const facultyAlice = { id: 'faculty-alice', role: 'faculty' };
    const facultyBob = { id: 'faculty-bob', role: 'faculty' };
    const adminUser = { id: 'admin-super', role: 'admin' };

    it('allows author faculty to update assessment', async () => {
      const { service } = createMockService({ assessments: [{ ...sem4Assessment }] });

      const res = await service.update('sem4-exam', { title: 'Updated OS Exam' }, facultyAlice);
      expect(res.success).toBe(true);
    });

    it('denies unauthorized faculty from updating assessment created by another faculty', async () => {
      const { service } = createMockService({ assessments: [{ ...sem4Assessment }] });

      await expect(
        service.update('sem4-exam', { title: 'Hijacked Title' }, facultyBob),
      ).rejects.toThrow(ForbiddenException);
    });

    it('denies unauthorized faculty from toggling status or archiving another faculty assessment', async () => {
      const { service } = createMockService({ assessments: [{ ...sem4Assessment }] });

      await expect(
        service.updateStatus('sem4-exam', 'ongoing', facultyBob),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.delete('sem4-exam', facultyBob),
      ).rejects.toThrow(ForbiddenException);
    });

    it('denies unauthorized faculty from viewing results of another faculty assessment', async () => {
      const { service } = createMockService({ assessments: [{ ...sem4Assessment }] });

      await expect(
        service.getAssessmentResults('sem4-exam', facultyBob),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows system admin to manage and view results for any assessment', async () => {
      const { service } = createMockService({ assessments: [{ ...sem4Assessment }] });

      const res = await service.getAssessmentResults('sem4-exam', adminUser);
      expect(res.success).toBe(true);
      expect(Array.isArray(res.attempts)).toBe(true);
    });
  });

  describe('Individual Student Targeting & Open Access Fallback', () => {
    const studentAliceSem2: any = {
      id: 'student-alice-id',
      uid: '22BCS101',
      role: 'student',
      studentProfile: { semester: 2, section: 'B', department: 'Mechanical', batch: '2028' },
    };

    const studentBobSem6: any = {
      id: 'student-bob-id',
      uid: '20BCS999',
      role: 'student',
      studentProfile: { semester: 6, section: 'C', department: 'Civil', batch: '2024' },
    };

    it('allows all students when targeting criteria are empty (Open Access)', async () => {
      const openAssessment: any = {
        id: 'open-exam',
        title: 'Open Campus Hackathon',
        code: 'OPEN101',
        status: 'published',
        durationMinutes: 60,
        totalMarks: 50,
        questions: ['q1'],
        targetSemesters: [],
        targetSections: [],
        targetBatches: [],
        targetDepartments: [],
        targetStudentIds: [],
      };
      const { service } = createMockService({ assessments: [openAssessment] });

      const overviewAlice = await service.getStudentAssessmentOverview('open-exam', studentAliceSem2);
      expect(overviewAlice.success).toBe(true);

      const overviewBob = await service.getStudentAssessmentOverview('open-exam', studentBobSem6);
      expect(overviewBob.success).toBe(true);
    });

    it('grants access to specific student in targetStudentIds irrespective of their semester/section', async () => {
      const sem4ExamWithAliceException: any = {
        ...sem4Assessment,
        id: 'sem4-with-exception',
        targetStudentIds: ['student-alice-id'], // Alice is Sem 2 Mech, but explicitly assigned
      };
      const { service } = createMockService({ assessments: [sem4ExamWithAliceException] });

      // Alice is Sem 2, but targeted by ID: must be allowed
      const overviewAlice = await service.getStudentAssessmentOverview('sem4-with-exception', studentAliceSem2);
      expect(overviewAlice.success).toBe(true);

      // Bob is Sem 6 and not targeted: must be denied
      await expect(
        service.getStudentAssessmentOverview('sem4-with-exception', studentBobSem6),
      ).rejects.toThrow(ForbiddenException);
    });

    it('restricts access exclusively to targetStudentIds when no cohort filters are set', async () => {
      const inviteOnlyExam: any = {
        id: 'invite-only',
        title: 'Honor Students Invitational',
        code: 'INVITE1',
        status: 'published',
        durationMinutes: 60,
        totalMarks: 50,
        questions: ['q1'],
        targetSemesters: [],
        targetSections: [],
        targetStudentIds: ['student-alice-id'],
      };
      const { service } = createMockService({ assessments: [inviteOnlyExam] });

      const overviewAlice = await service.getStudentAssessmentOverview('invite-only', studentAliceSem2);
      expect(overviewAlice.success).toBe(true);

      await expect(
        service.getStudentAssessmentOverview('invite-only', studentBobSem6),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Candidate Result Display Policy & Sequential Sections', () => {
    const studentUser: any = {
      id: 'student-eval-1',
      uid: 'STU-001',
      role: 'student',
      studentProfile: { semester: 4, section: 'CSE-A', department: 'Computer Science', batch: '2026', group: 'A' },
    };

    const question1: any = {
      id: 'q1',
      question: 'What is a Semaphore?',
      options: ['Synchronization primitive', 'Hardware bus', 'Compiler pass', 'Cache block'],
      correctAnswer: 0,
      explanation: 'A semaphore is a synchronization primitive.',
      marks: 10,
    };

    const attempt1: any = {
      id: 'att-1',
      assessmentId: 'exam-display',
      studentId: 'student-eval-1',
      studentUid: 'STU-001',
      status: 'submitted',
      score: 10,
      rawScore: 10,
      percentage: 100,
      passed: true,
      accuracy: 100,
      totalAttempted: 1,
      totalCorrect: 1,
      totalWrong: 0,
      totalSkipped: 0,
      timeSpentSeconds: 600,
      responses: [
        { questionId: 'q1', selectedAnswer: 0, isCorrect: true, marksAwarded: 10 },
      ],
    };

    it('withholds results and returns resultsPending when showResultImmediately is false', async () => {
      const assessmentHidden: any = {
        ...sem4Assessment,
        id: 'exam-display',
        questions: ['q1'],
        showResultImmediately: false,
        resultDisplaySettings: {
          customSubmissionMessage: 'Scores will be announced after evaluation.',
        },
      };
      const { service } = createMockService({
        assessments: [assessmentHidden],
        attempts: [attempt1],
        questions: [question1],
      });

      const res = await service.getStudentResult('exam-display', studentUser);
      expect(res.success).toBe(true);
      expect(res.resultsPending).toBe(true);
      expect(res.message).toBe('Scores will be announced after evaluation.');
      expect((res as any).attempt.score).toBeUndefined();
      expect((res as any).reviewQuestions).toBeUndefined();
    });

    it('redacts correct answers when showCorrectAnswers is false', async () => {
      const assessmentNoAnswers: any = {
        ...sem4Assessment,
        id: 'exam-display',
        questions: ['q1'],
        showResultImmediately: true,
        allowReview: true,
        resultDisplaySettings: {
          showCorrectAnswers: false,
        },
      };
      const { service } = createMockService({
        assessments: [assessmentNoAnswers],
        attempts: [attempt1],
        questions: [question1],
      });

      const res = await service.getStudentResult('exam-display', studentUser);
      expect(res.success).toBe(true);
      expect(res.reviewQuestions).toHaveLength(1);
      expect(res.reviewQuestions[0].correctAnswer).toBeUndefined();
      expect(res.reviewQuestions[0].explanation).toBeUndefined();
      expect(res.reviewQuestions[0].selectedAnswer).toBe(0);
    });

    it('passes section-lock settings to students without enabling a question timer', async () => {
      const assessmentSequential: any = {
        ...sem4Assessment,
        id: 'exam-seq',
        questions: ['q1'],
        lockSectionsSequentially: true,
        lockQuestionsSequentially: false,
        questionTimeLimitSeconds: 30,
        sections: [{ id: 'sec-1', title: 'Section 1', order: 0, timeLimit: 0, questions: [{ questionId: 'q1', marks: 10, negativeMarks: 0, order: 0 }] }],
      };
      const { service } = createMockService({
        assessments: [assessmentSequential],
        questions: [question1],
      });

      const overview = await service.getStudentAssessmentOverview('exam-seq', studentUser);
      expect(overview.assessment.lockSectionsSequentially).toBe(true);

      const start = await service.startStudentAttempt('exam-seq', studentUser);
      expect(start.lockSectionsSequentially).toBe(true);
      expect(start.lockQuestionsSequentially).toBe(false);
      expect(start.questionTimeLimitSeconds).toBe(0);
      expect(start.currentQuestionStartedAtEpochMs).toEqual(expect.any(Number));
    });

    it('atomically rejects jumps and permits one-question sequential advance', async () => {
      const assessment: any = {
        ...sem4Assessment,
        id: 'exam-nav',
        questions: ['q1', 'q2'],
        lockQuestionsSequentially: true,
        questionTimeLimitSeconds: 90,
      };
      const attempt: any = {
        id: 'attempt-nav',
        assessmentId: 'exam-nav',
        studentId: 'student-eval-1',
        studentUid: 'student-eval-1',
        status: 'in_progress',
        questionOrder: ['q1', 'q2'],
        currentQuestionIndex: 0,
        completedQuestionIds: [],
        navigationVersion: 0,
        responses: [],
      };
      const { service } = createMockService({ assessments: [assessment], attempts: [attempt] });

      await expect(service.navigateStudentAttempt('exam-nav', {
        targetQuestionIndex: 1,
        targetQuestionId: 'q2',
        navigationVersion: 0,
      }, studentUser)).resolves.toMatchObject({
        navigationAllowed: true,
        currentQuestionIndex: 1,
        questionTimeLimitSeconds: 90,
        currentQuestionStartedAtEpochMs: expect.any(Number),
      });

      await expect(service.navigateStudentAttempt('exam-nav', {
        targetQuestionIndex: 1,
        targetQuestionId: 'q2',
        navigationVersion: 0,
      }, studentUser)).rejects.toBeInstanceOf(Error);

      await expect(service.navigateStudentAttempt('exam-nav', {
        targetQuestionIndex: 2,
        targetQuestionId: 'q3',
        navigationVersion: 1,
      }, studentUser)).rejects.toBeInstanceOf(Error);

      await expect(service.navigateStudentAttempt('exam-nav', {
        targetQuestionIndex: 0,
        targetQuestionId: 'q1',
        navigationVersion: 1,
      }, studentUser)).rejects.toBeInstanceOf(Error);
    });

    it('allows navigation within the active section and rejects navigation into a locked section', async () => {
      const assessment: any = {
        ...sem4Assessment,
        id: 'exam-section-navigation',
        questions: ['q1', 'q2', 'q3'],
        shuffleQuestions: false,
        lockSectionsSequentially: true,
        sections: [
          { title: 'Section 1', order: 0, questions: [{ questionId: 'q1' }, { questionId: 'q2' }] },
          { title: 'Section 2', order: 1, questions: [{ questionId: 'q3' }] },
        ],
      };
      const attempt: any = {
        id: 'attempt-section-navigation',
        assessmentId: assessment.id,
        studentId: studentUser.id,
        status: 'in_progress',
        questionOrder: ['q1', 'q2', 'q3'],
        currentQuestionIndex: 0,
        completedSectionIds: [],
        navigationVersion: 0,
      };
      const questions = [
        { id: 'q1', question: 'First', questionType: 'single_choice', options: ['A', 'B'] },
        { id: 'q2', question: 'Second', questionType: 'single_choice', options: ['A', 'B'] },
        { id: 'q3', question: 'Third', questionType: 'single_choice', options: ['A', 'B'] },
      ];
      const { service } = createMockService({ assessments: [assessment], attempts: [attempt], questions });

      await expect(service.navigateStudentAttempt(assessment.id, {
        targetQuestionId: 'q2',
        targetQuestionIndex: 1,
        navigationVersion: 0,
      }, studentUser)).resolves.toMatchObject({
        navigationAllowed: true,
        currentQuestionIndex: 1,
        questionTimeLimitSeconds: 0,
        permittedQuestion: { _id: 'q2', sectionId: '0' },
      });

      await expect(service.navigateStudentAttempt(assessment.id, {
        targetQuestionId: 'q1',
        targetQuestionIndex: 0,
        navigationVersion: 1,
      }, studentUser)).resolves.toMatchObject({
        navigationAllowed: true,
        currentQuestionIndex: 0,
      });

      await expect(service.navigateStudentAttempt(assessment.id, {
        targetQuestionId: 'q3',
        targetQuestionIndex: 2,
        navigationVersion: 2,
      }, studentUser)).rejects.toBeInstanceOf(Error);
    });

    it('persists section completion and unlocks only the next section', async () => {
      const assessment: any = {
        ...sem4Assessment,
        id: 'exam-section-completion',
        questions: ['q1', 'q2', 'q3'],
        shuffleQuestions: false,
        lockSectionsSequentially: true,
        sections: [
          { title: 'Section 1', order: 0, questions: [{ questionId: 'q1' }, { questionId: 'q2' }] },
          { title: 'Section 2', order: 1, questions: [{ questionId: 'q3' }] },
        ],
      };
      const attempt: any = {
        id: 'attempt-section-completion',
        assessmentId: assessment.id,
        studentId: studentUser.id,
        status: 'in_progress',
        questionOrder: ['q1', 'q2', 'q3'],
        currentQuestionIndex: 1,
        completedSectionIds: [],
        navigationVersion: 0,
      };
      const questions = [
        { id: 'q1', question: 'First', questionType: 'single_choice', options: ['A', 'B'] },
        { id: 'q2', question: 'Second', questionType: 'single_choice', options: ['A', 'B'] },
        { id: 'q3', question: 'Third', questionType: 'single_choice', options: ['A', 'B'] },
      ];
      const { service } = createMockService({ assessments: [assessment], attempts: [attempt], questions });

      await expect(service.completeStudentAttemptSection(assessment.id, {
        sectionId: '0',
        navigationVersion: 0,
      }, studentUser)).resolves.toMatchObject({
        completedSectionIds: ['0'],
        activeSectionId: '1',
        assessmentReadyForSubmission: false,
        currentQuestionIndex: 2,
        questions: [expect.objectContaining({ _id: 'q3', questionIndex: 3, sectionId: '1' })],
      });
      expect(attempt.completedSectionIds).toEqual(['0']);
      await expect(service.getPermittedStudentQuestion(assessment.id, 'q1', studentUser))
        .rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.getPermittedStudentQuestion(assessment.id, 'q3', studentUser))
        .resolves.toMatchObject({ success: true });
    });

    it('rejects direct access to future or completed questions in sequential mode', async () => {
      const assessment: any = {
        ...sem4Assessment,
        id: 'exam-direct',
        questions: ['q1', 'q2'],
        lockQuestionsSequentially: true,
      };
      const attempt: any = {
        id: 'attempt-direct',
        assessmentId: 'exam-direct',
        studentId: 'student-eval-1',
        studentUid: 'student-eval-1',
        status: 'in_progress',
        questionOrder: ['q1', 'q2'],
        currentQuestionIndex: 1,
        completedQuestionIds: ['q1'],
        navigationVersion: 1,
      };
      const questions = [
        { id: 'q1', question: 'First' },
        { id: 'q2', question: 'Second' },
      ];
      const { service } = createMockService({ assessments: [assessment], attempts: [attempt], questions });

      await expect(service.getPermittedStudentQuestion('exam-direct', 'q1', studentUser)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.getPermittedStudentQuestion('exam-direct', 'q2', studentUser)).resolves.toMatchObject({ success: true });
    });

    it('replays legacy autosaves without overwriting previously completed sequential answers', async () => {
      const assessment: any = {
        ...sem4Assessment,
        id: 'exam-autosave',
        questions: ['q1', 'q2'],
        lockQuestionsSequentially: true,
      };
      const attempt: any = {
        id: 'attempt-autosave',
        assessmentId: 'exam-autosave',
        studentId: studentUser.id,
        status: 'in_progress',
        startedAt: new Date(),
        questionOrder: ['q1', 'q2'],
        currentQuestionIndex: 1,
        completedQuestionIds: ['q1'],
        navigationVersion: 1,
        responses: [
          { questionId: 'q1', selectedAnswer: 1, selectedAnswers: [1], code: '', language: 'python', status: 'answered' },
          { questionId: 'q2', selectedAnswer: -1, selectedAnswers: [], code: '', language: 'python', status: 'unvisited' },
        ],
      };
      const { service } = createMockService({ assessments: [assessment], attempts: [attempt] });

      await service.saveProgress('exam-autosave', {
        currentQuestionIndex: 1,
        responses: [
          { questionId: 'q1', selectedAnswer: 1, selectedAnswers: [1], code: '', language: 'python', status: 'answered' },
          { questionId: 'q2', selectedAnswer: 0, selectedAnswers: [0], code: '', language: 'python', status: 'answered' },
        ],
      }, studentUser);

      expect(attempt.responses).toEqual(expect.arrayContaining([
        expect.objectContaining({ questionId: 'q1', selectedAnswer: 1 }),
        expect.objectContaining({ questionId: 'q2', selectedAnswer: 0 }),
      ]));
      await expect(service.saveProgress('exam-autosave', {
        currentQuestionIndex: 1,
        responses: [{ questionId: 'q1', selectedAnswer: 2, selectedAnswers: [2] }],
      }, studentUser)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('Dynamic Targeting Options & Audience Preview', () => {
    const student1: any = {
      id: 's1',
      uid: '21BCS001',
      name: 'Alice Johnson',
      email: 'alice@cu.edu',
      role: 'student',
      isActive: true,
      studentProfile: { year: 3, semester: 5, section: 'CSE-1', batch: '2023-2027', department: 'CSE' },
    };

    const student2: any = {
      id: 's2',
      uid: '21BCS002',
      name: 'Bob Smith',
      email: 'bob@cu.edu',
      role: 'student',
      isActive: true,
      studentProfile: { year: 3, semester: 6, section: 'AIML-A', batch: '2023-2027', department: 'AIML' },
    };

    it('extracts distinct options from actual student data', async () => {
      const { service } = createMockService({ users: [student1, student2] });
      const options = await service.getTargetingOptions();

      expect(options.success).toBe(true);
      expect(options.semesters).toContain('5');
      expect(options.semesters).toContain('6');
      expect(options.sections).toContain('CSE-1');
      expect(options.sections).toContain('AIML-A');
      expect(options.batches).toContain('2023-2027');
      expect(options.totalStudents).toBe(2);
    });

    it('searches students by name or uid', async () => {
      const { service } = createMockService({ users: [student1, student2] });
      const searchRes = await service.searchStudents({ search: 'alice' });

      expect(searchRes.success).toBe(true);
      expect(searchRes.students).toHaveLength(2); // Mocked query builder returns users list, filtered in memory
      expect(searchRes.students[0].name).toBe('Alice Johnson');
    });

    it('previews target audience count and access mode accurately', async () => {
      const { service } = createMockService({ users: [student1, student2] });
      const previewOpen = await service.previewTargetAudience({});
      expect(previewOpen.accessMode).toBe('open_access');
      expect(previewOpen.totalCount).toBe(2);

      const previewSpecific = await service.previewTargetAudience({ targetStudentIds: ['s1'] });
      expect(previewSpecific.accessMode).toBe('specific_only');
      expect(previewSpecific.totalCount).toBe(1);
      expect(previewSpecific.sampleStudents[0].id).toBe('s1');
    });
  });
});
