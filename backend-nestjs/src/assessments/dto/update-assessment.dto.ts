import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsArray,
  IsEnum,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AssessmentSectionDto } from './create-assessment.dto';

export class UpdateAssessmentDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  code?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  @IsEnum(['mcq', 'coding', 'hybrid'])
  type?: 'mcq' | 'coding' | 'hybrid';

  @IsNumber()
  @Type(() => Number)
  @Min(1)
  @IsOptional()
  durationMinutes?: number;

  @IsNumber()
  @Type(() => Number)
  @IsOptional()
  passingMarks?: number;

  @IsBoolean()
  @IsOptional()
  negativeMarking?: boolean;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  questionIds?: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AssessmentSectionDto)
  @IsOptional()
  sections?: AssessmentSectionDto[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  targetSections?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  targetGroups?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  targetStudentIds?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  targetSemesters?: string[];

  @IsOptional()
  startTime?: string;

  @IsOptional()
  endTime?: string;

  @IsString()
  @IsOptional()
  @IsEnum(['draft', 'published', 'ongoing', 'completed', 'archived'])
  status?: 'draft' | 'published' | 'ongoing' | 'completed' | 'archived';

  @IsBoolean()
  @IsOptional()
  shuffleQuestions?: boolean;

  @IsBoolean()
  @IsOptional()
  shuffleOptions?: boolean;

  @IsBoolean()
  @IsOptional()
  showResultImmediately?: boolean;

  @IsBoolean()
  @IsOptional()
  allowReview?: boolean;

  @IsOptional()
  proctoring?: {
    enforceFullscreen?: boolean;
    blockCopyPaste?: boolean;
    detectTabSwitch?: boolean;
    maxTabSwitches?: number;
    autoSubmitOnViolation?: boolean;
  };

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  instructions?: string[];

  @IsNumber()
  @Type(() => Number)
  @IsOptional()
  allowedAttempts?: number;
}

export class UpdateAssessmentStatusDto {
  @IsString()
  @IsEnum(['draft', 'published', 'ongoing', 'completed', 'archived'])
  status: 'draft' | 'published' | 'ongoing' | 'completed' | 'archived';
}
