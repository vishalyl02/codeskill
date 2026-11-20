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
import { Assessment } from './assessment.entity';
import { User } from './user.entity';

@Entity('candidate_exam_accommodations')
@Index(['assessment_id', 'user_id'], { unique: true })
export class CandidateExamAccommodation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  assessment_id: string;

  @ManyToOne(() => Assessment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'assessment_id' })
  assessment: Assessment;

  @Column({ type: 'uuid' })
  @Index()
  user_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'float', default: 1.0 })
  time_multiplier: number;

  @Column({ type: 'boolean', default: false })
  secondary_display_allowed: boolean;

  @Column({ type: 'boolean', default: false })
  screen_reader_allowed: boolean;

  @Column({ type: 'text', nullable: true })
  custom_notes?: string;

  @Column({ type: 'uuid', nullable: true })
  granted_by?: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
