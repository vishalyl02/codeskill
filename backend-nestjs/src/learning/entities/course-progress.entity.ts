import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Unique,
} from 'typeorm';

@Entity('course_progress')
@Unique(['studentId', 'courseId'])
export class CourseProgress {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  studentId: string;

  @Index()
  @Column({ type: 'uuid' })
  courseId: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  pathId?: string;

  @Column({ type: 'float', default: 0 })
  percentage: number;

  @Column({ type: 'int', default: 0 })
  completedLessonsCount: number;

  @Column({ type: 'int', default: 0 })
  totalLessonsCount: number;

  @Column({ type: 'varchar', length: 50, default: 'in_progress' })
  status: 'in_progress' | 'completed';

  @Column({ type: 'timestamp', nullable: true })
  completedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
