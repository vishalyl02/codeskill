import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  BeforeInsert,
  BeforeUpdate,
  Index,
} from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { hashPassword, isBcryptHash } from '../../auth/password.util';

@Entity('users')
@Index(['isAssessmentStudent'])
@Index(['role'])
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  mongoId: string;

  @Column({ length: 50 })
  name: string;

  @Column({ unique: true, nullable: true })
  username?: string;

  @Column({ unique: true })
  email: string;

  @Column({ select: false, nullable: true })
  password?: string;

  @Column({
    type: 'varchar',
    length: 50,
    default: 'student',
  })
  role: string;

  @Column({ unique: true, nullable: true })
  uid?: string;

  @Column({ default: false })
  forcePasswordChange: boolean;

  @Column({ default: false })
  isAssessmentStudent: boolean;

  @Column({ default: false })
  mfaEnabled: boolean;

  @Column({ select: false, nullable: true })
  mfaSecret?: string;

  @Column({ default: true })
  isActive: boolean;

  /**
   * Incremented whenever the account's privileges or credentials change
   * (role change, password change/reset, deactivation, "log out everywhere").
   * Access tokens carry the value they were issued with and are rejected when
   * it no longer matches.
   */
  @Column({ type: 'int', default: 0 })
  tokenVersion: number;

  // We can use JSONB for highly nested or schema-less data
  // StudentProfile
  @Column({ type: 'jsonb', default: {} })
  studentProfile: {
    university?: string;
    department?: string;
    course?: string;
    semester?: number;
    section?: string;
    group?: string;
    year?: number;
    batch?: string;
  };

  @Column({ default: 'local' })
  authProvider: string;

  @Column({ nullable: true })
  googleId?: string;

  @Column({ nullable: true })
  githubId?: string;

  @Column({ nullable: true })
  linkedinId?: string;

  @Column({ default: '' })
  avatar: string;

  @Column({ length: 200, default: '' })
  bio: string;

  @Column({ default: false })
  isAdmin: boolean;

  // Profile
  @Column({ type: 'jsonb', default: {} })
  profile: {
    institution?: string;
    role?: string;
    preferredLanguage?: string;
    githubUrl?: string;
    githubUsername?: string;
    githubAvatarUrl?: string;
    theme?: string;
    fontSize?: number;
  };

  // Stats
  @Column({ type: 'jsonb', default: {} })
  stats: {
    totalSolved?: number;
    easySolved?: number;
    mediumSolved?: number;
    hardSolved?: number;
    dsaSolved?: number;
    sqlSolved?: number;
    jsSolved?: number;
    currentStreak?: number;
    longestStreak?: number;
    totalSubmissions?: number;
    acceptedSubmissions?: number;
    xp?: number;
  };

  @Column('text', { array: true, default: '{}' })
  solvedProblems: string[];

  @Column('text', { array: true, default: '{}' })
  bookmarkedProblems: string[];

  @Column({ type: 'jsonb', default: [] })
  badges: {
    badgeId: string;
    unlockedAt: Date;
  }[];

  @Column({ type: 'jsonb', default: {} })
  activityMap: Record<string, number>;

  @Column({ type: 'jsonb', default: {} })
  notes: Record<string, string>;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  lastActive: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastSolveDate?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @BeforeInsert()
  @BeforeUpdate()
  async hashPassword() {
    // Hash anything that is not already a well-formed bcrypt hash. The previous
    // `length < 60` heuristic stored long raw passwords in plaintext (NEW-008).
    if (this.password && !isBcryptHash(this.password)) {
      this.password = await hashPassword(this.password);
    }
  }

  async matchPassword(enteredPassword: string): Promise<boolean> {
    if (
      !this.password ||
      typeof enteredPassword !== 'string' ||
      !enteredPassword
    ) {
      return false;
    }
    return bcrypt.compare(enteredPassword, this.password);
  }

  updateStreak() {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    // Ensure stats is initialized
    if (!this.stats) {
      this.stats = { currentStreak: 0, longestStreak: 0 };
    }

    if (this.lastSolveDate) {
      const lastDate = this.lastSolveDate.toISOString().split('T')[0];
      if (lastDate === today) return; // Already solved today
      if (lastDate === yesterday) {
        this.stats.currentStreak = (this.stats.currentStreak || 0) + 1;
      } else {
        this.stats.currentStreak = 1;
      }
    } else {
      this.stats.currentStreak = 1;
    }

    if ((this.stats.currentStreak || 0) > (this.stats.longestStreak || 0)) {
      this.stats.longestStreak = this.stats.currentStreak;
    }

    this.lastSolveDate = new Date();
    if (!this.activityMap) {
      this.activityMap = {};
    }
    this.activityMap[today] = (this.activityMap[today] || 0) + 1;
  }
}
