import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Assessment } from './assessment.entity';
import { User } from './user.entity';

export type AttemptStatus =
  | 'in_progress'
  | 'evaluating'
  | 'submitted'
  | 'auto_submitted'
  | 'timed_out'
  | 'disqualified';

@Entity('assessment_attempts')
@Index(['assessmentId', 'studentId'])
@Index(['assessmentId', 'score'])
@Index(['assessmentId', 'status'])
@Index(['studentUid', 'status'])
@Index(['startedAt'])
@Index(['submittedAt'])
@Index(['status'])
export class AssessmentAttempt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Assessment, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'assessment_id' })
  assessment: Assessment;

  @Index()
  @Column({ name: 'assessment_id', type: 'uuid', nullable: true })
  assessmentId: string;

  get assessment_id(): string {
    return this.assessmentId;
  }
  set assessment_id(val: string) {
    this.assessmentId = val;
  }

  @ManyToOne(() => User, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student: User;

  @Index()
  @Column({ name: 'student_id', type: 'uuid', nullable: true })
  studentId: string;

  get student_id(): string {
    return this.studentId;
  }
  set student_id(val: string) {
    this.studentId = val;
  }

  @Column({ type: 'varchar', nullable: true })
  mongoId?: string;

  @Column({ type: 'varchar', length: 100 })
  studentUid: string;

  @Column({ type: 'varchar', length: 255 })
  studentName: string;

  @Column({ type: 'varchar', length: 255 })
  studentEmail: string;

  @Column({
    type: 'varchar',
    length: 50,
    default: 'in_progress',
  })
  status: AttemptStatus;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  startedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  submittedAt?: Date;

  @Column({ type: 'int', default: 0 })
  timeSpentSeconds: number;

  @Column({ type: 'jsonb', default: [] })
  responses: any[];

  @Column('text', { array: true, default: '{}' })
  questionOrder: string[];

  @Column({ type: 'float', default: 0 })
  score: number;

  @Column({ type: 'float', default: 0 })
  rawScore: number;

  @Column({ type: 'float', default: 0 })
  proctoringPenalty: number;

  @Column({ type: 'varchar', length: 50, nullable: true })
  mode?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  submissionPolicy?: string;

  @Column({ type: 'float', nullable: true, default: 0 })
  highestScore?: number;

  @Column({ type: 'int', default: 1 })
  attemptNumber?: number;

  @Column({ type: 'int', default: 0 })
  resumeCount: number;

  @Column({ type: 'float', default: 0 })
  maxScore: number;

  @Column({ type: 'float', default: 0 })
  percentage: number;

  @Column({ default: false })
  passed: boolean;

  @Column({ type: 'int', default: 0 })
  totalAttempted: number;

  @Column({ type: 'int', default: 0 })
  totalCorrect: number;

  @Column({ type: 'int', default: 0 })
  totalWrong: number;

  @Column({ type: 'int', default: 0 })
  totalSkipped: number;

  @Column({ type: 'float', default: 0 })
  accuracy: number;

  @Column({ type: 'int', default: 0 })
  tabSwitchCount: number;

  @Column({ type: 'int', default: 0 })
  fullscreenExitCount: number;

  @Column({ type: 'jsonb', default: [] })
  violations: any[];

  @Column({ type: 'jsonb', default: [] })
  captures: Array<{ type: string; url: string; timestamp: Date; filename?: string }>;

  @Column({ type: 'text', nullable: true, default: '' })
  disqualifiedReason?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
