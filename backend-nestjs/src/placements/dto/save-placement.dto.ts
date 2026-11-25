import { Type, Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
  Matches,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
class ResourceLinkDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(120) title: string;
  @Transform(trim)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2000)
  url: string;
}
export class SavePlacementDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(180)
  companyName: string;
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(12000)
  companyProfile: string;
  @IsOptional()
  @IsString()
  @MaxLength(175000)
  @Matches(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/)
  logoImage?: string | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(180) jobTitle?: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(120) package: string;
  @IsOptional() @IsDateString() visitDate?: string | null;
  @IsIn(['draft', 'published', 'archived']) status:
    'draft' | 'published' | 'archived';
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ResourceLinkDto)
  learningResources: ResourceLinkDto[];
}
