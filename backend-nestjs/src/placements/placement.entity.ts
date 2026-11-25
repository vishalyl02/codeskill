import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type PlacementStatus = 'draft' | 'published' | 'archived';
export type DocumentCategory =
  'job-description' | 'company-profile' | 'learning-resource';
export interface PlacementDocument {
  id: string;
  name: string;
  size: number;
  category: DocumentCategory;
  key: string;
}
export interface PlacementLink {
  title: string;
  url: string;
}

@Entity('placements')
export class Placement {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ length: 180 }) companyName: string;
  @Column({ type: 'text' }) companyProfile: string;
  @Column({ type: 'text', nullable: true }) logoImage: string | null;
  @Column({ length: 180, default: '' }) jobTitle: string;
  @Column({ length: 120 }) package: string;
  @Column({ type: 'date', nullable: true }) visitDate: string | null;
  @Column({ length: 20, default: 'draft' }) status: PlacementStatus;
  @Column({ type: 'jsonb', default: [] }) documents: PlacementDocument[];
  @Column({ type: 'jsonb', default: [] }) learningResources: PlacementLink[];
  @Column('uuid') createdById: string;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
