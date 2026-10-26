import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsArray,
  IsIn,
  Min,
  IsObject,
} from 'class-validator';

export class CreateLearningPathDto {
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

  @IsString()
  @IsOptional()
  iconUrl?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  estimatedHours?: number;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @IsIn(['draft', 'published', 'archived'])
  @IsOptional()
  status?: 'draft' | 'published' | 'archived';

  @IsObject()
  @IsOptional()
  completionCriteria?: {
    minCourseCompletionRate?: number;
    requireAllMandatory?: boolean;
    passQuizThreshold?: number;
  };

  @IsArray()
  @IsOptional()
  courseIds?: string[];
}

export class UpdateLearningPathDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsIn(['beginner', 'intermediate', 'advanced'])
  @IsOptional()
  difficulty?: 'beginner' | 'intermediate' | 'advanced';

  @IsString()
  @IsOptional()
  iconUrl?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  estimatedHours?: number;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @IsIn(['draft', 'published', 'archived'])
  @IsOptional()
  status?: 'draft' | 'published' | 'archived';

  @IsObject()
  @IsOptional()
  completionCriteria?: {
    minCourseCompletionRate?: number;
    requireAllMandatory?: boolean;
    passQuizThreshold?: number;
  };

  @IsArray()
  @IsOptional()
  courseIds?: string[];
}
