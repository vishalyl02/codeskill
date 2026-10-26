jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));

import { GamificationService } from './services/gamification.service';

describe('GamificationService', () => {
  let service: GamificationService;

  const mockXpRepo = {
    findOne: jest.fn(),
    create: jest.fn((dto) => ({ id: 'xp-uuid-1', ...dto })),
    save: jest.fn((x) => Promise.resolve(x)),
    find: jest.fn(),
  };

  const mockBadgeDefRepo = {
    find: jest.fn(),
  };

  const mockStudentBadgeRepo = {
    find: jest.fn(),
    create: jest.fn((dto) => ({ id: 'sb-uuid-1', ...dto })),
    save: jest.fn((sb) => Promise.resolve(sb)),
  };

  const mockUserRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(() => {
    service = new GamificationService(
      mockXpRepo as any,
      mockBadgeDefRepo as any,
      mockStudentBadgeRepo as any,
      mockUserRepo as any,
    );
  });

  it('should award XP idempotently and prevent duplicate awards', async () => {
    // First call: not yet awarded
    mockXpRepo.findOne.mockResolvedValueOnce(null);
    mockUserRepo.findOne.mockResolvedValueOnce({
      id: 'student-uuid-1',
      stats: { xp: 50 },
    });

    const awarded = await service.awardXP(
      'student-uuid-1',
      25,
      'problem_solved',
      'prob-uuid-1',
      'Solved two sum',
    );
    expect(awarded).toBe(25);
    expect(mockXpRepo.save).toHaveBeenCalled();

    // Second call: already awarded with same idempotency key
    mockXpRepo.findOne.mockResolvedValueOnce({
      id: 'xp-uuid-1',
      studentId: 'student-uuid-1',
      idempotencyKey: 'problem_solved:prob-uuid-1',
    });

    const duplicateAward = await service.awardXP(
      'student-uuid-1',
      25,
      'problem_solved',
      'prob-uuid-1',
      'Solved two sum again',
    );
    expect(duplicateAward).toBe(0);
  });

  it('should calculate student level and achievements correctly', async () => {
    mockXpRepo.find.mockResolvedValue([
      { amount: 500 },
      { amount: 700 },
    ]);
    mockStudentBadgeRepo.find.mockResolvedValue([
      {
        badgeId: 'badge-1',
        awardedAt: new Date(),
        badge: {
          id: 'badge-1',
          name: 'First Solution',
          rarity: 'common',
          category: 'milestone',
        },
      },
    ]);

    const achievements = await service.getStudentAchievements('student-uuid-1');
    expect(achievements.totalXP).toBe(1200);
    expect(achievements.level).toBe('Developing');
    expect(achievements.badgeCount).toBe(1);
    expect(achievements.badges[0].name).toBe('First Solution');
  });
});
