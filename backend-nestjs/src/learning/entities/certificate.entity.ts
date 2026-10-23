import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Unique,
  OneToMany,
} from 'typeorm';
import { CertificateEvent } from './certificate-event.entity';

@Entity('certificates')
@Unique(['studentId', 'pathId'])
export class Certificate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Unique public credential identifier (e.g. CS-2026-X89K2A)
   */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 50, unique: true })
  credentialId: string;

  @Index()
  @Column({ type: 'uuid' })
  studentId: string;

  @Index()
  @Column({ type: 'uuid' })
  pathId: string;

  @Column({ type: 'varchar', length: 255 })
  pathTitle: string;

  @Column({ type: 'varchar', length: 255 })
  recipientName: string;

  @Column({ type: 'varchar', length: 50, default: 'valid' })
  status: 'valid' | 'revoked' | 'expired';

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  issueDate: Date;

  @Column({ type: 'jsonb', default: {} })
  metadata: {
    skills?: string[];
    totalHours?: number;
    completionScore?: number;
    templateId?: string;
  };

  @Column({ type: 'text', nullable: true })
  pdfUrl?: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  verificationUrl: string;

  @OneToMany(() => CertificateEvent, (event) => event.certificate, { cascade: true })
  events: CertificateEvent[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
