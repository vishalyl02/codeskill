import {
  IsString,
  IsOptional,
  IsArray,
  IsNumber,
  IsIn,
  IsBoolean,
  ValidateIf,
  ValidateNested,
  IsObject,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  QuestionExampleDto,
  QuestionTestCaseDto,
  StarterCodeDto,
  ReferenceSolutionDto,
} from './create-question.dto';

export class UpdateQuestionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  timeComplexity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  spaceComplexity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  question?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  options?: Array<
    string | { text: string; isCorrect?: boolean; explanation?: string }
  >;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  correctAnswer?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  correctAnswers?: number[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  explanation?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  topic?: string;

  @ApiPropertyOptional({
    type: [String],
    description:
      'Topic categories only; question type remains a separate field',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categories?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subtopic?: string;

  @ApiPropertyOptional({ enum: ['easy', 'medium', 'hard'] })
  @IsOptional()
  @IsIn(['easy', 'medium', 'hard'])
  difficulty?: 'easy' | 'medium' | 'hard';

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  marks?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  negativeMarks?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({
    enum: [
      'single_choice',
      'multiple_choice',
      'coding',
      'algorithmic',
      'MCQ',
      'MULTIPLE_CHOICE',
      'TRUE_FALSE',
      'CODE_OUTPUT',
      'DSA',
    ],
  })
  @IsOptional()
  @IsIn([
    'single_choice',
    'multiple_choice',
    'coding',
    'algorithmic',
    'MCQ',
    'MULTIPLE_CHOICE',
    'TRUE_FALSE',
    'CODE_OUTPUT',
    'DSA',
  ])
  questionType?: string;

  @ApiPropertyOptional({
    enum: [
      'pending',
      'approved',
      'rejected',
      'archived',
      'active',
      'draft',
      'published',
    ],
  })
  @IsOptional()
  @IsIn([
    'pending',
    'approved',
    'rejected',
    'archived',
    'active',
    'draft',
    'published',
  ])
  status?: string;

  @ApiPropertyOptional({ enum: ['Draft', 'Private', 'Published', 'Public'] })
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsIn(['Draft', 'Private', 'Published', 'Public'])
  visibility?: 'Draft' | 'Private' | 'Published' | 'Public';

  @ApiPropertyOptional()
  @ValidateIf((_, value: unknown) => value !== undefined)
  @Transform(({ obj, key }) => (obj as Record<string, unknown>)[key])
  @IsBoolean()
  contestOnly?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  // --- Extended Fields for Unified Model / Coding / DSA questions ---

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  slug?: string;

  @ApiPropertyOptional({ description: 'MCQ URL slug alias; stored in slug' })
  @IsOptional()
  @IsString()
  url_slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  codeSnippet?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  expectedOutput?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  problemStatement?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'string') {
      return value
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return value;
  })
  @IsArray()
  @IsString({ each: true })
  constraints?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionExampleDto)
  @IsObject({ each: true })
  examples?: QuestionExampleDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  inputFormat?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  outputFormat?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StarterCodeDto)
  @IsObject({ each: true })
  starterCode?: StarterCodeDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  supportedLanguages?: string[];

  @ApiPropertyOptional({
    description: 'Whether to hide the main method/driver from student editor',
  })
  @IsOptional()
  @IsBoolean()
  hideMainMethod?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  functionSignature?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  timeLimit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  memoryLimit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionTestCaseDto)
  @IsObject({ each: true })
  testCases?: QuestionTestCaseDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReferenceSolutionDto)
  @IsObject({ each: true })
  referenceSolutions?: ReferenceSolutionDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hints?: string[];
}
