import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('contests')
export class Contest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  mongoId: string;

  @Column()
  title: string;

  @Column({ unique: true })
  slug: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'timestamp' })
  startTime: Date;

  @Column({ type: 'timestamp' })
  endTime: Date;

  @Column('text', { array: true, default: '{}' })
  problems: string[];

  @Column({ default: false })
  isPrivate: boolean;

  @Column({ nullable: true })
  password?: string;

  @Column({
    type: 'jsonb',
    default: {
      enableFullscreen: true,
      enableCopyProtect: true,
      enablePasteProtect: true,
      enableDevToolsDetect: true,
      enableTabSwitchDetect: true,
      enableMultipleDeviceProtect: true,
      enableWatermark: true,
      warningLimit: 3,
      maxTabSwitchViolations: 3,
      actionOnMaxViolations: 'auto_submit',
      autoSubmitOnViolation: true,
    },
  })
  antiCheatConfig: any;

  @Column({ default: false })
  isPublished: boolean;

  @Column({ default: false })
  resultsPublished: boolean;

  @Column('text', { array: true, default: '{}' })
  participants: string[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
