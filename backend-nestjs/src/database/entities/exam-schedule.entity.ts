import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Assessment } from './assessment.entity';
import { User } from './user.entity';

export type ExamScheduleStatus = 'draft' | 'published' | 'completed' | 'cancelled';

export interface ExamScheduleConfig {
  earlyAccessMinutes: number;
  lateStartAllowanceMinutes: number;
  gracePeriodMinutes: number;
  maxDurationMinutes: number;
  allowedAttempts: number;
  allowResume: boolean;
  allowDisconnectionReentry: boolean;
  strictTimeBoundary: boolean;
}

@Entity('exam_schedules')
@Index(['assessmentId', 'status'])
@Index(['status'])
@Index(['academicSession', 'semester'])
export class ExamSchedule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'assessment_id', type: 'uuid' })
  assessmentId: string;

  @ManyToOne(() => Assessment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'assessment_id' })
  assessment: Assessment;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  code: string;

  @Column({ type: 'text', default: '' })
  description: string;

  @Column({ type: 'varchar', length: 50, default: '2026-2027' })
  academicSession: string;

  @Column({ type: 'int', default: 1 })
  semester: number;

  @Column({ type: 'varchar', length: 100, default: 'Computer Science and Engineering' })
  program: string;

  @Column({ type: 'int', default: 2026 })
  academicYear: number;

  @Column({
    type: 'varchar',
    length: 50,
    default: 'draft',
  })
  status: ExamScheduleStatus;

  @Column({ type: 'varchar', length: 100, default: 'Asia/Kolkata' })
  timezone: string;

  @Column({ type: 'int', default: 500 })
  maxConcurrentSessions: number;

  @Column({
    type: 'jsonb',
    default: {
      earlyAccessMinutes: 5,
      lateStartAllowanceMinutes: 15,
      gracePeriodMinutes: 5,
      maxDurationMinutes: 60,
      allowedAttempts: 1,
      allowResume: true,
      allowDisconnectionReentry: true,
      strictTimeBoundary: true,
    },
  })
  config: ExamScheduleConfig;

  @Column({ type: 'int', default: 0 })
  totalEligibleStudents: number;

  @Column({ type: 'int', default: 0 })
  totalAssignedStudents: number;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById?: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by_id' })
  createdBy?: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
