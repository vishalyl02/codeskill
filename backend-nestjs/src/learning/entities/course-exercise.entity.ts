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
import { Lesson } from './lesson.entity';

export interface QuizQuestionItem {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
}

@Entity('course_exercises')
export class CourseExercise {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  lessonId: string;

  @ManyToOne(() => Lesson, (l) => l.exercises, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lessonId' })
  lesson: Lesson;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'varchar', length: 50, default: 'coding' })
  type: 'coding' | 'quiz' | 'debugging';

  /**
   * Reference to existing `Problem` in `problems` table.
   * If set, coding practice delegates to the existing sandbox execution engine.
   */
  @Index()
  @Column({ type: 'uuid', nullable: true })
  problemId?: string;

  /**
   * If exercise is a standalone quiz, configuration holds questions, options, and explanations.
   */
  @Column({ type: 'jsonb', nullable: true })
  quizConfig?: {
    questions: QuizQuestionItem[];
  };

  @Column({ type: 'jsonb', nullable: true })
  starterCode?: Record<string, string>;

  @Column('text', { array: true, default: '{}' })
  hints: string[];

  @Column({ type: 'int', default: 10 })
  marks: number;

  @Column({ type: 'boolean', default: true })
  isMandatory: boolean;

  @Column({ type: 'int', default: 1 })
  order: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
