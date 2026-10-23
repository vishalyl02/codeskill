import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { BadgeDefinition } from './badge-definition.entity';

@Entity('student_badges')
@Unique(['studentId', 'badgeId'])
export class StudentBadge {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  studentId: string;

  @Index()
  @Column({ type: 'uuid' })
  badgeId: string;

  @ManyToOne(() => BadgeDefinition, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'badgeId' })
  badge: BadgeDefinition;

  @CreateDateColumn()
  awardedAt: Date;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>;
}
