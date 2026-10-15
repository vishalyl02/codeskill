import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { User } from './user.entity';
import { Contest } from './contest.entity';

@Entity('contest_attempts')
@Index(['contest_id', 'user_id', 'attemptNumber'], { unique: true })
export class ContestAttempt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  mongoId: string;

  @ManyToOne(() => Contest, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contest_id' })
  contest: Contest;

  @Column()
  contest_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column()
  user_id: string;

  @Column({ default: 1 })
  attemptNumber: number;

  @Column({ type: 'double precision', default: 0 })
  score: number;

  @Column({ default: 0 })
  problemsSolved: number;

  @Column()
  sessionId: string;

  @Column({ nullable: true })
  deviceFingerprint: string;

  @Column({ default: 'InProgress' })
  status: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  startedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  submittedAt: Date;

  @Column({ default: 0 })
  warnings: number;

  @Column({ type: 'jsonb', default: [] })
  violations: Array<{ type: string; timestamp: Date; metadata?: any }>;

  @Column({ type: 'jsonb', default: [] })
  savedCode: Array<{ problemId: string; code: string; language: string; lastSaved: Date }>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
