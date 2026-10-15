import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { Contest } from './contest.entity';

@Entity('contest_reattempt_grants')
@Index(['contest_id', 'user_id', 'status'])
@Index(['contest_id'])
export class ContestReattemptGrant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

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

  @Column({ nullable: true })
  grantedBy: string;

  @Column({ default: '' })
  grantedByEmail: string;

  @Column({ type: 'text', default: '' })
  reason: string;

  @Column({ default: 1 })
  allowedAttempts: number;

  @Column({ default: 0 })
  usedAttempts: number;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt?: Date;

  @Column({ default: 'ACTIVE' })
  status: string; // 'ACTIVE' | 'USED' | 'REVOKED' | 'EXPIRED'

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
