import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { Batch } from './batch.entity';

@Entity('faculty_assignments')
@Index(['faculty_id', 'batch_id', 'courseCode'], { unique: true })
export class FacultyAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'faculty_id' })
  faculty: User;

  @Index()
  @Column({ name: 'faculty_id', type: 'uuid' })
  faculty_id: string;

  @ManyToOne(() => Batch, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'batch_id' })
  batch: Batch;

  @Index()
  @Column({ name: 'batch_id', type: 'uuid' })
  batch_id: string;

  @Column({ name: 'course_code', type: 'varchar', length: 100 })
  courseCode: string;

  @Column({ name: 'section', type: 'varchar', length: 50, nullable: true })
  section?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
