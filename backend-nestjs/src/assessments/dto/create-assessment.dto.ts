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
} from 'class-validator';
import { Type } from 'class-transformer';

export class AssessmentQuestionConfigDto {
  @IsString()
  @IsNotEmpty()
  questionId: string;

  @IsNumber()
  @Type(() => Number)
  marks: number;

  @IsNumber()
  @Type(() => Number)
  @IsOptional()
  negativeMarks?: number;

  @IsNumber()
  @Type(() => Number)
  @IsOptional()
  order?: number;
}

export class AssessmentSectionDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @Type(() => Number)
  @IsOptional()
  order?: number;

  @IsNumber()
  @Type(() => Number)
  @IsOptional()
  timeLimit?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AssessmentQuestionConfigDto)
  questions: AssessmentQuestionConfigDto[];
}

export class CreateAssessmentDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  code: string;

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
  durationMinutes: number;

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
  questionIds?: string[]; // Backwards compatibility

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AssessmentSectionDto)
  @IsOptional()
  sections?: AssessmentSectionDto[];

  @IsString()
  @IsEnum(['draft', 'published', 'ongoing', 'completed', 'archived'])
  @IsOptional()
  status?: string;

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

  @IsNumber()
  @Type(() => Number)
  @IsOptional()
  allowedAttempts?: number;

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
}
