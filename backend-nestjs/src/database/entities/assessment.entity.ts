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
import { User } from './user.entity';

@Entity('assessments')
@Index(['status', 'startTime', 'endTime'])
@Index(['targetBatches'])
@Index(['targetDepartments'])
@Index(['targetStudentIds'])
@Index(['targetGroups'])
export class Assessment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  code: string;

  @Column({ type: 'text', default: '' })
  description: string;

  @Column({
    type: 'varchar',
    length: 50,
    default: 'mcq',
  })
  type: string;

  @Column({
    type: 'varchar',
    length: 50,
    default: 'exam',
  })
  category: string;

  @Column({ type: 'int', default: 60 })
  durationMinutes: number;

  @Column({ type: 'float', default: 0 })
  totalMarks: number;

  @Column({ type: 'float', default: 0 })
  passingMarks: number;

  @Column({ default: true })
  negativeMarking: boolean;

  @Column({ type: 'varchar', nullable: true })
  mongoId?: string;

  // Kept for backwards compatibility. In real PG, we'd use a JoinTable (Many-to-Many).
  // But since sections can hold questions, we'll store UUIDs/IDs here for easy transition.
  @Column('text', { array: true, default: '{}' })
  questions: string[];

  @Column({ type: 'jsonb', default: [] })
  sections: Array<{
    title: string;
    description: string;
    order: number;
    timeLimit: number;
    questions: Array<{
      questionId: string;
      marks: number;
      negativeMarks: number;
      order: number;
    }>;
  }>;

  @Column('text', { array: true, default: '{}' })
  targetBatches: string[];

  @Column('text', { array: true, default: '{}' })
  targetDepartments: string[];

  @Column('text', { array: true, default: '{}' })
  targetCourses: string[];

  @Column('text', { array: true, default: '{}' })
  targetSections: string[];

  @Column('text', { array: true, default: '{}' })
  targetGroups: string[];

  @Column('text', { array: true, default: '{}' })
  targetStudentIds: string[];

  @Column('text', { array: true, default: '{}' })
  targetSemesters: string[];

  @Column({ type: 'timestamp', nullable: true })
  startTime?: Date;

  @Column({ type: 'timestamp', nullable: true })
  endTime?: Date;

  @Column({ default: true })
  shuffleQuestions: boolean;

  @Column({ default: true })
  shuffleOptions: boolean;

  @Column({ default: true })
  showResultImmediately: boolean;

  @Column({ default: true })
  allowReview: boolean;

  @Column({ type: 'int', default: 1 })
  allowedAttempts: number;

  @Column({ type: 'jsonb', default: {} })
  proctoring: {
    enforceFullscreen?: boolean;
    blockCopyPaste?: boolean;
    detectTabSwitch?: boolean;
    maxTabSwitches?: number;
    autoSubmitOnViolation?: boolean;
  };

  @Column({ type: 'jsonb', default: {} })
  securityPolicy: {
    secureExamMode?: 'DISABLED' | 'STANDARD' | 'STRICT';
    requireSEB?: boolean;
    allowedSEBVersions?: string[];
    requireFullscreen?: boolean;
    disableClipboard?: boolean;
    disableNavigation?: boolean;
    disablePrinting?: boolean;
    allowDownloads?: boolean;
    allowUploads?: boolean;
    heartbeatInterval?: number;
    heartbeatGracePeriod?: number;
    violationThreshold?: number;
    proctoringMode?: 'NONE' | 'BASIC' | 'STANDARD' | 'STRICT';
  };

  @Column({
    type: 'varchar',
    length: 50,
    default: 'published',
  })
  status: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by_id' })
  createdBy?: User;

  @Column({ type: 'uuid', nullable: true })
  created_by_id?: string;

  @Column('text', { array: true, default: '{}' })
  instructions: string[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
