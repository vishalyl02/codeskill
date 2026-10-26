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
import { CourseModule } from './course-module.entity';
import { CourseExercise } from './course-exercise.entity';

@Entity('lessons')
export class Lesson {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  moduleId: string;

  @ManyToOne(() => CourseModule, (m) => m.lessons, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'moduleId' })
  module: CourseModule;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Index()
  @Column({ type: 'varchar', length: 255 })
  slug: string;

  /**
   * Structured reading content formatted in Markdown, complete with code blocks,
   * syntax highlighting, callout tips, and diagrams. NO VIDEO PLAYER.
   */
  @Column({ type: 'text' })
  content: string;

  @Column('text', { array: true, default: '{}' })
  learningObjectives: string[];

  @Column({ type: 'int', default: 1 })
  order: number;

  @Column({ type: 'varchar', length: 50, default: 'reading' })
  type: 'reading' | 'quiz' | 'coding' | 'debugging';

  @Column({ type: 'int', default: 0 })
  passingScore: number;

  @OneToMany(() => CourseExercise, (ce) => ce.lesson, { cascade: true })
  exercises: CourseExercise[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
