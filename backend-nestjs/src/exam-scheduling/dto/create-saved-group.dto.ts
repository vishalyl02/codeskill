import {
  IsString,
  IsEnum,
  IsOptional,
  IsArray,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StudentFilterCriteriaDto } from './bulk-assign-students.dto';

export class CreateSavedGroupDto {
  @ApiProperty({ description: 'Name of the saved cohort / group' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'Description of the group' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    enum: ['filter_dynamic', 'snapshot_fixed'],
    default: 'snapshot_fixed',
    description: 'Whether cohort evaluates dynamically on use or stores fixed snapshot of students',
  })
  @IsEnum(['filter_dynamic', 'snapshot_fixed'])
  groupType: 'filter_dynamic' | 'snapshot_fixed';

  @ApiPropertyOptional({ type: StudentFilterCriteriaDto })
  @IsOptional()
  filterCriteria?: StudentFilterCriteriaDto;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  studentIds?: string[];
}
