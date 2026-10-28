import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('exam_access_audit_logs')
@Index(['scheduleId', 'action'])
@Index(['studentId'])
@Index(['studentUid'])
@Index(['actorId'])
@Index(['createdAt'])
export class ExamAccessAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'schedule_id', type: 'uuid', nullable: true })
  scheduleId?: string;

  @Index()
  @Column({ name: 'slot_id', type: 'uuid', nullable: true })
  slotId?: string;

  @Index()
  @Column({ name: 'student_id', type: 'uuid', nullable: true })
  studentId?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  studentUid?: string;

  @Index()
  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId?: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'actor_id' })
  actor?: User;

  @Column({ type: 'varchar', length: 255 })
  actorEmail: string;

  @Column({ type: 'varchar', length: 50, default: 'admin' })
  actorRole: string;

  @Column({ type: 'varchar', length: 100 })
  action: string;

  @Column({ type: 'text', nullable: true })
  reason?: string;

  @Column({ type: 'jsonb', nullable: true })
  previousState?: any;

  @Column({ type: 'jsonb', nullable: true })
  newState?: any;

  @Column({ type: 'varchar', length: 100, nullable: true })
  ipAddress?: string;

  @Column({ type: 'text', nullable: true })
  userAgent?: string;

  @CreateDateColumn()
  createdAt: Date;
}
