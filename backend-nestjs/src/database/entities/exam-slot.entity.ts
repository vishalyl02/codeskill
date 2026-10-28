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
import { ExamSchedule } from './exam-schedule.entity';

export type ExamSlotStatus = 'scheduled' | 'ongoing' | 'completed' | 'cancelled';

@Entity('exam_slots')
@Index(['scheduleId', 'date'])
@Index(['scheduleId', 'status'])
@Index(['startTime', 'endTime'])
export class ExamSlot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'schedule_id', type: 'uuid' })
  scheduleId: string;

  @ManyToOne(() => ExamSchedule, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'schedule_id' })
  schedule: ExamSchedule;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ type: 'varchar', length: 50 })
  slotCode: string;

  @Column({ type: 'varchar', length: 20 })
  date: string; // YYYY-MM-DD

  @Column({ type: 'timestamp with time zone' })
  startTime: Date;

  @Column({ type: 'timestamp with time zone' })
  endTime: Date;

  @Column({ type: 'int', default: 300 })
  capacity: number;

  @Column({ type: 'int', default: 0 })
  assignedCount: number;

  @Column({
    type: 'varchar',
    length: 50,
    default: 'scheduled',
  })
  status: ExamSlotStatus;

  @Column({ type: 'varchar', length: 150, nullable: true })
  roomOrLab?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
