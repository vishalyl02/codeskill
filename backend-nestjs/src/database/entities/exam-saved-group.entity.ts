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

export type SavedGroupType = 'filter_dynamic' | 'snapshot_fixed';

@Entity('exam_saved_groups')
@Index(['groupType'])
export class ExamSavedGroup {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ type: 'text', default: '' })
  description: string;

  @Column({
    type: 'varchar',
    length: 50,
    default: 'snapshot_fixed',
  })
  groupType: SavedGroupType;

  @Column({
    type: 'jsonb',
    default: {},
  })
  filterCriteria: {
    academicSession?: string;
    semester?: number;
    program?: string;
    department?: string;
    section?: string;
    batch?: string;
    year?: number;
    isActive?: string;
    search?: string;
  };

  @Column('text', { array: true, default: '{}' })
  studentIds: string[];

  @Column({ type: 'int', default: 0 })
  studentCount: number;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById?: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by_id' })
  createdBy?: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
