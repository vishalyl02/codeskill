import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Unique,
} from 'typeorm';

@Entity('learning_enrollments')
@Unique(['studentId', 'pathId', 'pathVersion'])
export class LearningEnrollment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  studentId: string;

  @Index()
  @Column({ type: 'uuid' })
  pathId: string;

  @Column({ type: 'int', default: 1 })
  pathVersion: number;

  @Column({ type: 'varchar', length: 50, default: 'active' })
  status: 'active' | 'completed' | 'dropped';

  @CreateDateColumn()
  enrolledAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt?: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
