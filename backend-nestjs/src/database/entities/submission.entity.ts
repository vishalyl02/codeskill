import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
  Check,
} from 'typeorm';
import { User } from './user.entity';
import { Problem } from './problem.entity';

export type ProblemSource = 'problem' | 'metadata' | 'question';

@Entity('submissions')
@Check(
  'CHK_submissions_problem_source',
  `"problemSource" IN ('problem', 'metadata', 'question')`,
)
@Index(['userId', 'problemId', 'status'])
@Index('IDX_submissions_contest_attempt_problem_status', ['contestAttemptId', 'problemId', 'status'])
@Index(['createdAt'])
@Index(['status'])
@Index(['language'])
export class Submission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid', nullable: true })
  contestAttemptId?: string | null;

  // problemId also identifies metadata-backed practice problems.
  @ManyToOne(() => Problem, { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'problemId' })
  problem: Problem;

  @Column({ type: 'uuid' })
  problemId: string;

  @Column({ type: 'varchar', length: 20, default: 'problem' })
  problemSource: ProblemSource;

  @Column({ type: 'text' })
  code: string;

  @Column({ type: 'varchar', length: 50 })
  language: string;

  @Column({
    type: 'varchar',
    length: 50,
    default: 'Pending',
  })
  status: string;

  @Column({ type: 'float', nullable: true })
  executionTime?: number;

  @Column({ type: 'float', nullable: true })
  memoryUsed?: number;

  @Column({ type: 'int', nullable: true })
  testsPassed?: number;

  @Column({ type: 'int', nullable: true })
  totalTests?: number;

  @Column({ type: 'text', nullable: true })
  errorMessage?: string;

  @Column({ type: 'jsonb', default: [] })
  testResults: Array<{
    testId: string;
    passed: boolean;
    executionTime?: number;
    memoryUsed?: number;
    error?: string;
    status?: string;
    isHidden?: boolean;
    input?: string;
    output?: string;
    expected?: string;
  }>;

  @Column({ type: 'varchar', nullable: true })
  mongoId?: string;

  @Column({ type: 'float', nullable: true })
  runtime?: number;

  @Column({ type: 'float', nullable: true })
  memory?: number;

  @Column({ type: 'int', nullable: true })
  testCasesPassed?: number;

  @Column({ type: 'int', nullable: true })
  totalTestCases?: number;

  @Column({ type: 'text', nullable: true })
  compileOutput?: string;

  @Column({ type: 'timestamp', nullable: true })
  queuedAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  startedAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
