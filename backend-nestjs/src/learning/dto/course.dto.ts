import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsArray,
  IsIn,
  Min,
  IsBoolean,
  IsObject,
} from 'class-validator';

export class CreateCourseDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  slug?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsIn(['beginner', 'intermediate', 'advanced'])
  @IsOptional()
  difficulty?: 'beginner' | 'intermediate' | 'advanced';

  @IsInt()
  @Min(5)
  @IsOptional()
  estimatedMinutes?: number;

  @IsIn(['draft', 'published', 'archived'])
  @IsOptional()
  status?: 'draft' | 'published' | 'archived';
}

export class CreateCourseModuleDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsInt()
  @IsOptional()
  order?: number;

  @IsInt()
  @IsOptional()
  requiredTimeMinutes?: number;

  @IsInt()
  @IsOptional()
  requiredTimeSeconds?: number;
}

export class UpdateCourseModuleDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsInt()
  @IsOptional()
  order?: number;

  @IsInt()
  @IsOptional()
  requiredTimeMinutes?: number;

  @IsInt()
  @IsOptional()
  requiredTimeSeconds?: number;
}

export class TrackTimeSpentDto {
  @IsInt()
  seconds: number;
}

export class CompleteLessonDto {
  @IsInt()
  @IsOptional()
  timeSpentSeconds?: number;
}

export class CreateLessonDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  slug?: string;

  @IsString()
  @IsNotEmpty()
  content: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  learningObjectives?: string[];

  @IsInt()
  @IsOptional()
  order?: number;

  @IsIn(['reading', 'quiz', 'coding', 'debugging'])
  @IsOptional()
  type?: 'reading' | 'quiz' | 'coding' | 'debugging';

  @IsInt()
  @IsOptional()
  passingScore?: number;
}

export class CreateCourseExerciseDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsIn(['coding', 'quiz', 'debugging'])
  @IsOptional()
  type?: 'coding' | 'quiz' | 'debugging';

  @IsString()
  @IsOptional()
  problemId?: string;

  @IsObject()
  @IsOptional()
  quizConfig?: any;

  @IsObject()
  @IsOptional()
  starterCode?: Record<string, string>;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  hints?: string[];

  @IsInt()
  @IsOptional()
  marks?: number;

  @IsBoolean()
  @IsOptional()
  isMandatory?: boolean;

  @IsInt()
  @IsOptional()
  order?: number;
}

export class SubmitExerciseDto {
  @IsString()
  @IsOptional()
  code?: string;

  @IsString()
  @IsOptional()
  language?: string;

  @IsInt()
  @IsOptional()
  selectedOption?: number;

  @IsOptional()
  answers?: any;
}
