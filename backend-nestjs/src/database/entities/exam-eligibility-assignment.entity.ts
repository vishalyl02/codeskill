import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { ExamSchedule } from './exam-schedule.entity';
import { ExamSlot } from './exam-slot.entity';
import { Assessment } from './assessment.entity';
import { User } from './user.entity';
import { AssessmentAttempt } from './assessment-attempt.entity';

export type EligibilityAssignmentStatus =
  | 'eligible'
  | 'assigned'
  | 'in_progress'
  | 'completed'
  | 'absent'
  | 'revoked'
  | 'rescheduled'
  | 'expired';

export type AssignmentSource = 'filter' | 'manual' | 'csv' | 'saved_group';

@Entity('exam_eligibility_assignments')
@Unique(['scheduleId', 'studentId'])
@Index(['scheduleId', 'status'])
@Index(['slotId', 'status'])
@Index(['assessmentId', 'studentId'])
@Index(['studentUid'])
@Index(['accessWindowStart', 'accessWindowEnd'])
export class ExamEligibilityAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'schedule_id', type: 'uuid' })
  scheduleId: string;

  @ManyToOne(() => ExamSchedule, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'schedule_id' })
  schedule: ExamSchedule;

  @Index()
  @Column({ name: 'slot_id', type: 'uuid', nullable: true })
  slotId?: string;

  @ManyToOne(() => ExamSlot, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'slot_id' })
  slot?: ExamSlot;

  @Index()
  @Column({ name: 'assessment_id', type: 'uuid' })
  assessmentId: string;

  @ManyToOne(() => Assessment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'assessment_id' })
  assessment: Assessment;

  @Index()
  @Column({ name: 'student_id', type: 'uuid' })
  studentId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student: User;

  @Column({ type: 'varchar', length: 100 })
  studentUid: string;

  @Column({ type: 'varchar', length: 255 })
  studentEmail: string;

  @Column({ type: 'varchar', length: 255 })
  studentName: string;

  @Column({
    type: 'jsonb',
    default: {},
  })
  academicSnapshot: {
    department?: string;
    course?: string;
    semester?: number;
    section?: string;
    batch?: string;
    year?: number;
  };

  @Column({
    type: 'varchar',
    length: 50,
    default: 'eligible',
  })
  status: EligibilityAssignmentStatus;

  @Column({
    type: 'varchar',
    length: 50,
    default: 'filter',
  })
  assignmentSource: AssignmentSource;

  @Column({ type: 'timestamp with time zone', nullable: true })
  accessWindowStart?: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  accessWindowEnd?: Date;

  @Column({ type: 'text', nullable: true })
  overrideReason?: string;

  @Column({ name: 'override_by_id', type: 'uuid', nullable: true })
  overrideById?: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'override_by_id' })
  overrideBy?: User;

  @Column({ type: 'timestamp with time zone', nullable: true })
  overrideAt?: Date;

  @Column({ name: 'attempt_id', type: 'uuid', nullable: true })
  attemptId?: string;

  @ManyToOne(() => AssessmentAttempt, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'attempt_id' })
  attempt?: AssessmentAttempt;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
