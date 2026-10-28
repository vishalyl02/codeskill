import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsArray,
  IsEnum,
  Min,
  ValidateNested,
  Matches,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { AssessmentSectionDto } from './create-assessment.dto';
import { normalizeSectionIdentifier } from '../../common/constants/sections.constant';

class UpdateAssessmentProctoringDto {
  @IsString()
  @IsOptional()
  @IsEnum(['system_default', 'student_select'])
  cameraSelectionPolicy?: 'system_default' | 'student_select';

  @IsString()
  @IsOptional()
  @IsEnum(['fully_proctored', 'partial_proctored', 'non_proctored'])
  mode?: 'fully_proctored' | 'partial_proctored' | 'non_proctored';

  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @IsOptional()
  violationPenaltyMarks?: number;

  @IsBoolean()
  @IsOptional()
  useCamera?: boolean;

  @IsBoolean()
  @IsOptional()
  enforceFullscreen?: boolean;

  @IsBoolean()
  @IsOptional()
  blockCopyPaste?: boolean;

  @IsBoolean()
  @IsOptional()
  detectTabSwitch?: boolean;

  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @IsOptional()
  maxTabSwitches?: number;

  @IsBoolean()
  @IsOptional()
  autoSubmitOnViolation?: boolean;
}

export class UpdateAssessmentDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  title?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  code?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  @IsEnum(['mcq', 'coding', 'hybrid'])
  type?: 'mcq' | 'coding' | 'hybrid';

  @IsString()
  @IsOptional()
  @IsEnum(['exam', 'quiz', 'practice', 'recruitment'])
  category?: string;

  @IsNumber()
  @Type(() => Number)
  @Min(5)
  @IsOptional()
  durationMinutes?: number;

  @IsNumber()
  @Type(() => Number)
  @IsOptional()
  @Min(0)
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
  targetBatches?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  targetDepartments?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  targetCourses?: string[];

  @IsArray()
  @Transform(({ value }) => {
    if (!Array.isArray(value)) return value;
    const normalized = value
      .map((sec) => normalizeSectionIdentifier(sec))
      .filter(Boolean);
    return [...new Set(normalized)];
  })
  @Matches(/^[A-Za-z0-9_\-]{1,16}$/, {
    each: true,
    message: 'Each targetSection must be a valid section identifier (e.g. A1, B4)',
  })
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
  @Transform(({ value }) => (Array.isArray(value) ? value.map(String) : value))
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

  @ValidateNested()
  @Type(() => UpdateAssessmentProctoringDto)
  @IsOptional()
  proctoring?: UpdateAssessmentProctoringDto;

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
