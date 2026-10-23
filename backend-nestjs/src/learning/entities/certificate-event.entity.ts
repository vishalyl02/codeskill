import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Certificate } from './certificate.entity';

@Entity('certificate_events')
export class CertificateEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  certificateId: string;

  @ManyToOne(() => Certificate, (cert) => cert.events, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'certificateId' })
  certificate: Certificate;

  @Column({ type: 'varchar', length: 50 })
  eventType: 'issued' | 'viewed' | 'verified' | 'revoked';

  @Column({ type: 'uuid', nullable: true })
  actorId?: string;

  @Column({ type: 'text', nullable: true })
  reason?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  ipAddress?: string;

  @CreateDateColumn()
  createdAt: Date;
}
