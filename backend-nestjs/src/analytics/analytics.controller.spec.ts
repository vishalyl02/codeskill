import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';

describe('AnalyticsController', () => {
  let controller: AnalyticsController;
  let service: Partial<Record<keyof AnalyticsService, jest.Mock>>;

  beforeEach(async () => {
    service = {
      getPlatformOverview: jest.fn().mockResolvedValue({ totalStudents: 100 }),
      getActivity: jest.fn().mockResolvedValue({ codingActivity: [] }),
      getLanguages: jest.fn().mockResolvedValue({ languages: [] }),
      getLeaderboard: jest.fn().mockResolvedValue({ leaderboard: [], total: 0 }),
      getAssessmentsOverview: jest.fn().mockResolvedValue({ totalAssessments: 5 }),
      getRetention: jest.fn().mockResolvedValue({ dau: 25, mau: 100 }),
      getAssessmentOverview: jest.fn().mockResolvedValue({ totalAttempts: 10 }),
      getAssessmentLeaderboard: jest.fn().mockResolvedValue({ leaderboard: [] }),
      getQuestionAnalytics: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [
        {
          provide: AnalyticsService,
          useValue: service,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .overrideGuard(AdminGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<AnalyticsController>(AnalyticsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('has JwtAuthGuard and AdminGuard applied at class level', () => {
    const guards = Reflect.getMetadata('__guards__', AnalyticsController);
    expect(guards).toBeDefined();
    expect(guards).toContain(JwtAuthGuard);
    expect(guards).toContain(AdminGuard);
  });

  describe('getOverview', () => {
    it('calls getPlatformOverview and returns overview KPIs', async () => {
      const res = await controller.getOverview();
      expect(service.getPlatformOverview).toHaveBeenCalledTimes(1);
      expect(res).toEqual({ totalStudents: 100 });
    });
  });

  describe('getActivity', () => {
    it('calls getActivity with query parameters', async () => {
      const query = { period: '30d' as const };
      const res = await controller.getActivity(query);
      expect(service.getActivity).toHaveBeenCalledWith(query);
      expect(res).toEqual({ codingActivity: [] });
    });
  });

  describe('getLanguages', () => {
    it('calls getLanguages and returns breakdown', async () => {
      const res = await controller.getLanguages();
      expect(service.getLanguages).toHaveBeenCalledTimes(1);
      expect(res).toEqual({ languages: [] });
    });
  });

  describe('getLeaderboard', () => {
    it('calls getLeaderboard with query parameters', async () => {
      const query = { page: 1, limit: 10 };
      const res = await controller.getLeaderboard(query);
      expect(service.getLeaderboard).toHaveBeenCalledWith(query);
      expect(res).toEqual({ leaderboard: [], total: 0 });
    });
  });

  describe('getAssessments', () => {
    it('calls getAssessmentsOverview', async () => {
      const res = await controller.getAssessments();
      expect(service.getAssessmentsOverview).toHaveBeenCalledTimes(1);
      expect(res).toEqual({ totalAssessments: 5 });
    });
  });

  describe('getRetention', () => {
    it('calls getRetention', async () => {
      const res = await controller.getRetention();
      expect(service.getRetention).toHaveBeenCalledTimes(1);
      expect(res).toEqual({ dau: 25, mau: 100 });
    });
  });

  describe('getAssessmentOverview', () => {
    it('calls getAssessmentOverview with assessment id', async () => {
      const res = await controller.getAssessmentOverview('asmt-123');
      expect(service.getAssessmentOverview).toHaveBeenCalledWith('asmt-123');
      expect(res).toEqual({ totalAttempts: 10 });
    });
  });

  describe('getAssessmentLeaderboard', () => {
    it('parses page and limit numbers correctly', async () => {
      await controller.getAssessmentLeaderboard('asmt-123', '2', '15');
      expect(service.getAssessmentLeaderboard).toHaveBeenCalledWith('asmt-123', 2, 15);
    });
  });
});
