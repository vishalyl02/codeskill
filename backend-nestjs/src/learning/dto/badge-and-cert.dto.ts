import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  IsObject,
  IsBoolean,
} from 'class-validator';

export class CreateBadgeDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  iconUrl?: string;

  @IsIn(['common', 'rare', 'epic', 'legendary'])
  @IsOptional()
  rarity?: 'common' | 'rare' | 'epic' | 'legendary';

  @IsIn(['skills', 'mastery', 'milestone'])
  @IsOptional()
  category?: 'skills' | 'mastery' | 'milestone';

  @IsObject()
  @IsOptional()
  criteria?: Record<string, any>;
}

export class CreateCertificateTemplateDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  issuerTitle?: string;

  @IsString()
  @IsOptional()
  issuerName?: string;

  @IsString()
  @IsOptional()
  issuerOrganization?: string;

  @IsString()
  @IsOptional()
  logoUrl?: string;

  @IsString()
  @IsOptional()
  signatureUrl?: string;

  @IsString()
  @IsOptional()
  badgeUrl?: string;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}

export class RevokeCertificateDto {
  @IsString()
  @IsNotEmpty()
  reason: string;
}
