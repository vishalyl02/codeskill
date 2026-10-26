import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('badge_definitions')
export class BadgeDefinition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 100, unique: true })
  code: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', default: '' })
  description: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  iconUrl: string;

  @Column({ type: 'varchar', length: 50, default: 'common' })
  rarity: 'common' | 'rare' | 'epic' | 'legendary';

  @Column({ type: 'varchar', length: 50, default: 'milestone' })
  category: 'skills' | 'mastery' | 'milestone';

  @Column({ type: 'jsonb', default: {} })
  criteria: {
    type?: string;
    count?: number;
    pathId?: string;
    skill?: string;
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
