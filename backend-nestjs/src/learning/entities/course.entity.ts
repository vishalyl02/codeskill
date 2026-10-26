import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { CourseModule } from './course-module.entity';
import { LearningPathCourse } from './learning-path-course.entity';

@Entity('courses')
export class Course {
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

  @Column({ type: 'int', default: 60 })
  estimatedMinutes: number;

  @Index()
  @Column({ type: 'varchar', length: 50, default: 'published' })
  status: 'draft' | 'published' | 'archived';

  @OneToMany(() => CourseModule, (mod) => mod.course, { cascade: true })
  modules: CourseModule[];

  @OneToMany(() => LearningPathCourse, (lpc) => lpc.course)
  pathCourses: LearningPathCourse[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
