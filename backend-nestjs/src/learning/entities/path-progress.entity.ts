import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Unique,
} from 'typeorm';

@Entity('path_progress')
@Unique(['studentId', 'pathId'])
export class PathProgress {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  studentId: string;

  @Index()
  @Column({ type: 'uuid' })
  pathId: string;

  @Column({ type: 'float', default: 0 })
  percentage: number;

  @Column({ type: 'int', default: 0 })
  completedCoursesCount: number;

  @Column({ type: 'int', default: 0 })
  totalCoursesCount: number;

  @Column({ type: 'boolean', default: false })
  isCertified: boolean;

  @Column({ type: 'varchar', length: 50, default: 'in_progress' })
  status: 'in_progress' | 'completed';

  @Column({ type: 'timestamp', nullable: true })
  completedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
