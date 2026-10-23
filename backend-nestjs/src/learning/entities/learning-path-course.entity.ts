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
import { LearningPath } from './learning-path.entity';
import { Course } from './course.entity';

@Entity('learning_path_courses')
@Unique(['pathId', 'courseId'])
export class LearningPathCourse {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  pathId: string;

  @ManyToOne(() => LearningPath, (lp) => lp.pathCourses, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pathId' })
  path: LearningPath;

  @Index()
  @Column({ type: 'uuid' })
  courseId: string;

  @ManyToOne(() => Course, (c) => c.pathCourses, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'courseId' })
  course: Course;

  @Column({ type: 'int', default: 1 })
  order: number;

  @Column({ type: 'boolean', default: true })
  isMandatory: boolean;

  @Column('text', { array: true, default: '{}' })
  prerequisiteCourseIds: string[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
