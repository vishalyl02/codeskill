import {
  IsString,
  IsNotEmpty,
  IsArray,
  IsNumber,
  IsOptional,
  IsIn,
  IsBoolean,
  ValidateIf,
  ValidateNested,
  Allow,
  IsObject,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Nested shapes must be real classes with @ValidateNested + @Type, otherwise the
 * global ValidationPipe's `whitelist: true` strips every property and silently
 * persists empty records.
 */
export class QuestionExampleDto {
  @Allow()
  @IsOptional()
  @IsString()
  id?: string;

  @Allow()
  @IsOptional()
  @IsString()
  input?: string;

  @Allow()
  @IsOptional()
  @IsString()
  output?: string;

  @Allow()
  @IsOptional()
  @IsString()
  explanation?: string;
}

export class QuestionTestCaseDto {
  @Allow()
  @IsOptional()
  @IsString()
  id?: string;

  @Allow()
  @IsOptional()
  @IsString()
  input?: string;

  @Allow()
  @IsOptional()
  @IsString()
  expectedOutput?: string;

  @Allow()
  @IsOptional()
  @IsString()
  output?: string;

  @Allow()
  @IsOptional()
  @IsString()
  explanation?: string;

  @Allow()
  @IsOptional()
  @IsBoolean()
  isHidden?: boolean;

  @Allow()
  @IsOptional()
  @IsNumber()
  weight?: number;
}

export class StarterCodeDto {
  @Allow()
  @IsOptional()
  @IsString()
  language?: string;

  @Allow()
  @IsOptional()
  @IsString()
  code?: string;
}

export class ReferenceSolutionDto {
  @Allow()
  @IsOptional()
  @IsString()
  language?: string;

  @Allow()
  @IsOptional()
  @IsString()
  sourceCode?: string;
}

export class CreateQuestionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  question?: string;

  @ApiProperty({
    example: ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)'],
    description: 'Array of options',
  })
  @IsOptional()
  @IsArray()
  options?: Array<
    string | { text: string; isCorrect?: boolean; explanation?: string }
  >;

  @ApiPropertyOptional({
    example: 1,
    description: 'Zero-based index of the correct option (0, 1, 2, or 3)',
  })
  @IsOptional()
  @IsNumber()
  correctAnswer?: number;

  @ApiPropertyOptional({
    example:
      'Binary search repeatedly divides the search interval in half, leading to O(log n) time complexity.',
  })
  @IsOptional()
  @IsString()
  explanation?: string;

  @ApiProperty({ example: 'Data Structures & Algorithms' })
  @IsNotEmpty()
  @IsString()
  topic: string;

  @ApiPropertyOptional({
    type: [String],
    description:
      'Topic categories only; question type remains a separate field',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categories?: string[];

  @ApiPropertyOptional({ example: 'Searching Algorithms' })
  @IsOptional()
  @IsString()
  subtopic?: string;

  @ApiPropertyOptional({ enum: ['easy', 'medium', 'hard'], default: 'medium' })
  @IsOptional()
  @IsIn(['easy', 'medium', 'hard'])
  difficulty?: 'easy' | 'medium' | 'hard' = 'medium';

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsNumber()
  marks?: number = 1;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber()
  negativeMarks?: number = 0;

  @ApiPropertyOptional({ default: 'general' })
  @IsOptional()
  @IsString()
  language?: string = 'general';

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
    default: 'single_choice',
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
  questionType?: string = 'single_choice';

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

  @ApiPropertyOptional({
    type: [String],
    example: ['binary-search', 'algorithms', 'time-complexity'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  // --- Extended Fields for Unified Model (Phase 1) ---

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
  @IsArray()
  @IsNumber({}, { each: true })
  correctAnswers?: number[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  code?: string;

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
