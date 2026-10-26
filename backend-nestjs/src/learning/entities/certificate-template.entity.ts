import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('certificate_templates')
export class CertificateTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255, default: 'Certificate of Achievement' })
  title: string;

  @Column({ type: 'varchar', length: 255, default: 'Head of Technical Training' })
  issuerTitle: string;

  @Column({ type: 'varchar', length: 255, default: 'Technical Training Team' })
  issuerName: string;

  @Column({ type: 'varchar', length: 255, default: 'CodeSkill · Chandigarh University' })
  issuerOrganization: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  logoUrl: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  signatureUrl: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  badgeUrl: string;

  @Column({ type: 'boolean', default: false })
  isDefault: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
