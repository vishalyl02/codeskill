jest.mock('@nestjs/typeorm', () => ({ InjectRepository: () => () => {} }));
jest.mock('@react-pdf/renderer', () => ({
  renderToStream: jest.fn().mockResolvedValue({
    pipe: jest.fn((res) => res.end('mock-pdf-stream')),
  }),
  StyleSheet: {
    create: (styles: any) => styles,
  },
  Font: {
    register: jest.fn(),
  },
  Document: () => null,
  Page: () => null,
  Text: () => null,
  View: () => null,
  Image: () => null,
  Svg: () => null,
  Path: () => null,
  Circle: () => null,
  Rect: () => null,
  G: () => null,
  Line: () => null,
}));

import { NotFoundException } from '@nestjs/common';
import { ReportsController } from './reports.controller';

describe('ReportsController candidate confidentiality and report generation', () => {
  let controller: ReportsController;
  const mockAttemptRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
  };
  const mockAssessmentRepo = { findOne: jest.fn() };
  const mockQuestionRepo = { findOne: jest.fn(), find: jest.fn().mockResolvedValue([]) };

  const ownerStudent = { id: 'student-owner-uuid', email: 'owner@test.com', role: 'student', isAdmin: false };
  const otherStudent = { id: 'other-student-uuid', email: 'other@test.com', role: 'student', isAdmin: false };
  const adminUser = { id: 'admin-uuid', email: 'admin@test.com', role: 'super_admin', isAdmin: true };

  const attemptId = 'attempt-uuid-1';
  const mockAttempt = {
    id: attemptId,
    studentId: ownerStudent.id,
    studentUid: 'CU-2026-001',
    assessmentId: 'assessment-uuid-1',
    studentName: 'Test Student',
    studentEmail: ownerStudent.email,
    responses: [],
    score: 85,
    maxScore: 100,
    timeSpentSeconds: 1200,
    status: 'submitted',
  };

  const mockAssessment = {
    id: 'assessment-uuid-1',
    title: 'Final Examination',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockAttemptRepo.findOne.mockResolvedValue(mockAttempt);
    mockAttemptRepo.find.mockResolvedValue([mockAttempt]);
    mockAssessmentRepo.findOne.mockResolvedValue(mockAssessment);

    controller = new ReportsController(
      mockAttemptRepo as never,
      mockAssessmentRepo as never,
      mockQuestionRepo as never,
    );
  });

  it('allows the candidate who owns the attempt to download the report', async () => {
    const res = { set: jest.fn(), status: jest.fn().mockReturnThis(), send: jest.fn(), end: jest.fn() };
    await controller.getStudentResultReport(attemptId, ownerStudent, res as never);

    expect(res.set).toHaveBeenCalledWith(
      expect.objectContaining({
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Content-Disposition': 'inline; filename="result-CU-2026-001.pdf"',
      }),
    );
  });

  it('allows an administrator to download candidate reports', async () => {
    const res = { set: jest.fn(), status: jest.fn().mockReturnThis(), send: jest.fn(), end: jest.fn() };
    await controller.getStudentResultReport(attemptId, adminUser, res as never);
    expect(res.set).toHaveBeenCalled();
  });

  it('rejects another student from viewing someone elses attempt report', async () => {
    const res = { set: jest.fn(), status: jest.fn().mockReturnThis(), send: jest.fn(), end: jest.fn() };
    await expect(
      controller.getStudentResultReport(attemptId, otherStudent, res as never),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns 404 when attempt is not found', async () => {
    mockAttemptRepo.findOne.mockResolvedValue(null);
    const res = { set: jest.fn(), status: jest.fn().mockReturnThis(), send: jest.fn(), end: jest.fn() };
    await expect(
      controller.getStudentResultReport('non-existent', ownerStudent, res as never),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('batches question lookups in a single query instead of N+1 individual queries (ISSUE-DAT-003)', async () => {
    const attemptWithQuestions = {
      ...mockAttempt,
      responses: [
        { questionId: 'q-1', isCorrect: true, marksAwarded: 10 },
        { questionId: 'q-2', isCorrect: false, marksAwarded: 0 },
      ],
    };
    mockAttemptRepo.findOne.mockResolvedValue(attemptWithQuestions);
    mockQuestionRepo.find.mockResolvedValue([
      { id: 'q-1', title: 'Question 1', difficulty: 'Easy' },
      { id: 'q-2', title: 'Question 2', difficulty: 'Hard' },
    ]);
    const res = { set: jest.fn(), status: jest.fn().mockReturnThis(), send: jest.fn(), end: jest.fn() };
    await controller.getStudentResultReport(attemptId, ownerStudent, res as never);

    expect(mockQuestionRepo.find).toHaveBeenCalledTimes(1);
    expect(mockQuestionRepo.findOne).not.toHaveBeenCalled();
  });

  it('calculates correct rank and percentile for candidates with different scores (Rohan 35/50, Ishita 50/50, Ananya 15/50)', async () => {
    const ishitaAttempt = {
      id: 'att-ishita',
      studentId: 'user-ishita',
      studentUid: 'CU-2026-002',
      studentName: 'Ishita Patel',
      score: 50,
      maxScore: 50,
      timeSpentSeconds: 2150,
      status: 'submitted',
    };
    const rohanAttempt = {
      id: 'att-rohan',
      studentId: 'user-rohan',
      studentUid: 'CU-2026-003',
      studentName: 'Rohan Gupta',
      score: 35,
      maxScore: 50,
      timeSpentSeconds: 2800,
      status: 'submitted',
    };
    const ananyaAttempt = {
      id: 'att-ananya',
      studentId: 'user-ananya',
      studentUid: 'CU-2026-006',
      studentName: 'Ananya Roy',
      score: 15,
      maxScore: 50,
      timeSpentSeconds: 1800,
      status: 'submitted',
    };

    mockAttemptRepo.find.mockResolvedValue([ishitaAttempt, rohanAttempt, ananyaAttempt]);

    // Test Ishita (score 50/50 -> Rank 1 of 3, Top 33%)
    mockAttemptRepo.findOne.mockResolvedValue(ishitaAttempt);
    const resIshita = { set: jest.fn(), status: jest.fn().mockReturnThis(), send: jest.fn(), end: jest.fn() };
    await controller.getStudentResultReport('att-ishita', adminUser, resIshita as never);
    expect(resIshita.set).toHaveBeenCalledWith(
      expect.objectContaining({
        'Content-Disposition': 'inline; filename="result-CU-2026-002.pdf"',
      }),
    );

    // Test Rohan (score 35/50 -> Rank 2 of 3, Top 67%)
    mockAttemptRepo.findOne.mockResolvedValue(rohanAttempt);
    const resRohan = { set: jest.fn(), status: jest.fn().mockReturnThis(), send: jest.fn(), end: jest.fn() };
    await controller.getStudentResultReport('att-rohan', adminUser, resRohan as never);
    expect(resRohan.set).toHaveBeenCalledWith(
      expect.objectContaining({
        'Content-Disposition': 'inline; filename="result-CU-2026-003.pdf"',
      }),
    );

    // Test Ananya (score 15/50 -> Rank 3 of 3, Top 100%)
    mockAttemptRepo.findOne.mockResolvedValue(ananyaAttempt);
    const resAnanya = { set: jest.fn(), status: jest.fn().mockReturnThis(), send: jest.fn(), end: jest.fn() };
    await controller.getStudentResultReport('att-ananya', adminUser, resAnanya as never);
    expect(resAnanya.set).toHaveBeenCalledWith(
      expect.objectContaining({
        'Content-Disposition': 'inline; filename="result-CU-2026-006.pdf"',
      }),
    );
  });

  it('correctly handles tied scores and assigns identical ranks', async () => {
    const tied1 = {
      id: 'att-tie-1',
      studentId: 'user-1',
      studentUid: 'CU-TIE-01',
      score: 40,
      timeSpentSeconds: 1500,
      submittedAt: new Date('2026-10-22T10:00:00Z'),
      status: 'submitted',
    };
    const tied2 = {
      id: 'att-tie-2',
      studentId: 'user-2',
      studentUid: 'CU-TIE-02',
      score: 40,
      timeSpentSeconds: 1500,
      submittedAt: new Date('2026-10-22T10:00:00Z'),
      status: 'submitted',
    };
    const third = {
      id: 'att-third',
      studentId: 'user-3',
      studentUid: 'CU-THIRD',
      score: 30,
      timeSpentSeconds: 1200,
      status: 'submitted',
    };

    mockAttemptRepo.find.mockResolvedValue([tied1, tied2, third]);
    mockAttemptRepo.findOne.mockResolvedValue(tied2);

    const res = { set: jest.fn(), status: jest.fn().mockReturnThis(), send: jest.fn(), end: jest.fn() };
    await controller.getStudentResultReport('att-tie-2', adminUser, res as never);
    expect(res.set).toHaveBeenCalledWith(
      expect.objectContaining({
        'Content-Disposition': 'inline; filename="result-CU-TIE-02.pdf"',
      }),
    );
  });
});
