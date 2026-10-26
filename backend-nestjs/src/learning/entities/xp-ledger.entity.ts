import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  Unique,
} from 'typeorm';

export type XPEventType =
  | 'lesson_completed'
  | 'quiz_passed'
  | 'problem_solved'
  | 'course_completed'
  | 'path_completed';

@Entity('xp_ledger')
@Unique(['studentId', 'idempotencyKey'])
export class XPLedger {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  studentId: string;

  @Column({ type: 'int' })
  amount: number;

  @Index()
  @Column({ type: 'varchar', length: 50 })
  eventType: XPEventType;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  entityId?: string;

  @Index()
  @Column({ type: 'varchar', length: 255 })
  idempotencyKey: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  notes: string;

  @CreateDateColumn()
  createdAt: Date;
}
