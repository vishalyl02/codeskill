import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { XPLedger, XPEventType } from '../entities/xp-ledger.entity';
import { BadgeDefinition } from '../entities/badge-definition.entity';
import { StudentBadge } from '../entities/student-badge.entity';
import { User } from '../../database/entities/user.entity';

@Injectable()
export class GamificationService {
  private readonly logger = new Logger(GamificationService.name);

  constructor(
    @InjectRepository(XPLedger)
    private readonly xpRepo: Repository<XPLedger>,
    @InjectRepository(BadgeDefinition)
    private readonly badgeDefRepo: Repository<BadgeDefinition>,
    @InjectRepository(StudentBadge)
    private readonly studentBadgeRepo: Repository<StudentBadge>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  /**
   * Idempotent XP award. If (studentId, idempotencyKey) already exists, returns 0 without error.
   */
  async awardXP(
    studentId: string,
    amount: number,
    eventType: XPEventType,
    entityId?: string,
    notes?: string,
  ): Promise<number> {
    const idempotencyKey = `${eventType}:${entityId || 'general'}`;
    try {
      const existing = await this.xpRepo.findOne({
        where: { studentId, idempotencyKey },
      });
      if (existing) {
        return 0; // Already awarded, idempotent no-op
      }

      const entry = this.xpRepo.create({
        studentId,
        amount,
        eventType,
        entityId,
        idempotencyKey,
        notes: notes || '',
      });
      await this.xpRepo.save(entry);

      // Atomically increment student stats.xp if user exists
      const user = await this.userRepo.findOne({ where: { id: studentId } });
      if (user) {
        const currentStats = user.stats || {};
        const currentXP = currentStats.xp || 0;
        user.stats = {
          ...currentStats,
          xp: currentXP + amount,
        };
        await this.userRepo.save(user);
      }

      return amount;
    } catch (error) {
      this.logger.warn(`Failed or duplicate XP award for ${studentId}: ${error.message}`);
      return 0;
    }
  }

  /**
   * Check and unlock any badges the student has earned based on triggers
   */
  async checkAndAwardBadges(
    studentId: string,
    trigger: { type: string; count?: number; pathId?: string },
  ): Promise<BadgeDefinition[]> {
    const newlyAwarded: BadgeDefinition[] = [];
    try {
      // Find badge definitions matching criteria
      const allBadges = await this.badgeDefRepo.find();
      const existingStudentBadges = await this.studentBadgeRepo.find({
        where: { studentId },
      });
      const ownedBadgeIds = new Set(existingStudentBadges.map((b) => b.badgeId));

      for (const badge of allBadges) {
        if (ownedBadgeIds.has(badge.id)) continue;

        const criteria = badge.criteria || {};
        let matches = false;

        if (criteria.type === trigger.type) {
          if (criteria.count && trigger.count && trigger.count >= criteria.count) {
            matches = true;
          } else if (criteria.pathId && trigger.pathId === criteria.pathId) {
            matches = true;
          } else if (!criteria.count && !criteria.pathId) {
            matches = true;
          }
        }

        if (matches) {
          const studentBadge = this.studentBadgeRepo.create({
            studentId,
            badgeId: badge.id,
            metadata: { trigger },
          });
          await this.studentBadgeRepo.save(studentBadge);
          newlyAwarded.push(badge);
        }
      }
    } catch (err) {
      this.logger.error(`Error checking badges for student ${studentId}: ${err.message}`);
    }
    return newlyAwarded;
  }

  /**
   * Get student gamification summary: total XP, earned badges, and skill levels
   */
  async getStudentAchievements(studentId: string) {
    const xpRecords = await this.xpRepo.find({ where: { studentId } });
    const totalXP = xpRecords.reduce((sum, r) => sum + r.amount, 0);

    const studentBadges = await this.studentBadgeRepo.find({
      where: { studentId },
      relations: { badge: true },
      order: { awardedAt: 'DESC' },
    });

    // Compute rank / level based on total XP
    let level = 'Novice';
    let nextThreshold = 1000;
    if (totalXP >= 12000) {
      level = 'Expert';
      nextThreshold = 25000;
    } else if (totalXP >= 6000) {
      level = 'Advanced';
      nextThreshold = 12000;
    } else if (totalXP >= 3000) {
      level = 'Proficient';
      nextThreshold = 6000;
    } else if (totalXP >= 1000) {
      level = 'Developing';
      nextThreshold = 3000;
    }

    return {
      totalXP,
      level,
      nextThreshold,
      progressToNextLevel: Math.min(100, Math.round((totalXP / nextThreshold) * 100)),
      badgeCount: studentBadges.length,
      badges: studentBadges.map((sb) => ({
        id: sb.badge?.id || sb.badgeId,
        code: sb.badge?.code,
        name: sb.badge?.name,
        description: sb.badge?.description,
        iconUrl: sb.badge?.iconUrl,
        rarity: sb.badge?.rarity,
        category: sb.badge?.category,
        awardedAt: sb.awardedAt,
      })),
      recentXPHistory: xpRecords.slice(-10).reverse(),
    };
  }
}
