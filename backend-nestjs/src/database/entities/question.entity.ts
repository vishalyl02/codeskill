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

@Entity('questions')
@Index(['topic', 'difficulty', 'status'])
@Index(['topic', 'subtopic'])
@Index(['status', 'createdAt'])
@Index(['aiGenerated', 'status'])
export class Question {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', nullable: true })
  mongoId?: string;

  @Column({ type: 'text' })
  question: string;

  @Column('text', { array: true, default: '{}' })
  options: string[];

  @Column({ type: 'int', default: 0 })
  correctAnswer: number;

  @Column({ type: 'text', default: '' })
  explanation: string;

  @Column({ type: 'text', nullable: true })
  codeSnippet?: string;

  @Column({ type: 'varchar', length: 100 })
  topic: string;

  @Column({ type: 'varchar', length: 100, default: '' })
  subtopic: string;

  @Column({
    type: 'varchar',
    length: 50,
    default: 'medium',
  })
  difficulty: string;

  @Column({ type: 'float', default: 1 })
  marks: number;

  @Column({ type: 'float', default: 0 })
  negativeMarks: number;

  @Column({ type: 'varchar', length: 50, default: 'general' })
  language: string;

  @Column({
    type: 'varchar',
    length: 50,
    default: 'single_choice',
  })
  questionType: string;

  @Column({
    type: 'varchar',
    length: 50,
    default: 'approved',
  })
  status: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by_id' })
  createdBy: User;

  @Column({ type: 'uuid', nullable: true })
  created_by_id?: string;

  @Column({ default: false })
  aiGenerated: boolean;

  @Column({ type: 'varchar', length: 50, nullable: true })
  aiProvider?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  aiModel?: string;

  @Column({ type: 'timestamp', nullable: true })
  generatedAt?: Date;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'approved_by_id' })
  approvedBy?: User;

  @Column({ type: 'uuid', nullable: true })
  approved_by_id?: string;

  @Column({ type: 'timestamp', nullable: true })
  approvedAt?: Date;

  @Column({ type: 'text', nullable: true })
  rejectedReason?: string;

  @Column('text', { array: true, default: '{}' })
  tags: string[];

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>;

  // Unified Model (Phase 1) Extra Fields
  @Column({ type: 'varchar', length: 255, nullable: true })
  title?: string;

  @Column({ type: 'varchar', length: 255, unique: true, nullable: true })
  slug?: string | null;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column('int', { array: true, default: '{}' })
  correctAnswers?: number[];

  @Column({ type: 'text', nullable: true })
  code?: string;

  @Column({ type: 'text', nullable: true })
  expectedOutput?: string;

  @Column({ type: 'text', nullable: true })
  problemStatement?: string;

  @Column('text', { array: true, default: '{}' })
  constraints?: string[];

  @Column({ type: 'jsonb', default: [] })
  examples?: Array<{ input: string; output: string; explanation?: string }>;

  @Column({ type: 'text', nullable: true })
  inputFormat?: string;

  @Column({ type: 'text', nullable: true })
  outputFormat?: string;

  @Column({ type: 'jsonb', default: [] })
  starterCode?: Array<{ language: string; code: string }>;

  @Column('text', { array: true, default: '{}' })
  supportedLanguages?: string[];

  @Column({ type: 'boolean', default: false })
  hideMainMethod?: boolean;

  @Column({ type: 'text', nullable: true })
  functionSignature?: string;

  @Column({ type: 'int', default: 1000 })
  timeLimit?: number;

  @Column({ type: 'int', default: 256 })
  memoryLimit?: number;

  @Column({ type: 'jsonb', default: [] })
  testCases?: Array<{
    id: string;
    input: string;
    expectedOutput: string;
    isHidden: boolean;
    weight: number;
  }>;

  @Column({ type: 'jsonb', default: [] })
  referenceSolutions?: Array<{ language: string; sourceCode: string }>;

  @Column('text', { array: true, default: '{}' })
  hints?: string[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
