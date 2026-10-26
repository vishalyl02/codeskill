import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { LearningPathCourse } from './learning-path-course.entity';

@Entity('learning_paths')
export class LearningPath {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255, unique: true })
  slug: string;

  @Column({ type: 'text', default: '' })
  description: string;

  @Column({ type: 'varchar', length: 50, default: 'beginner' })
  difficulty: 'beginner' | 'intermediate' | 'advanced';

  @Column({ type: 'varchar', length: 255, default: '' })
  iconUrl: string;

  @Column({ type: 'int', default: 10 })
  estimatedHours: number;

  @Column('text', { array: true, default: '{}' })
  tags: string[];

  @Index()
  @Column({ type: 'varchar', length: 50, default: 'draft' })
  status: 'draft' | 'published' | 'archived';

  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({
    type: 'jsonb',
    default: {
      minCourseCompletionRate: 100,
      requireAllMandatory: true,
      passQuizThreshold: 70,
    },
  })
  completionCriteria: {
    minCourseCompletionRate: number;
    requireAllMandatory: boolean;
    passQuizThreshold: number;
  };

  @OneToMany(() => LearningPathCourse, (lpc) => lpc.path, { cascade: true })
  pathCourses: LearningPathCourse[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
