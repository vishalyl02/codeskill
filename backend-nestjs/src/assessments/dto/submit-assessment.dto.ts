import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
  IsIn,
  IsISO8601,
  MaxLength,
  IsObject,
  ArrayMaxSize,
  ArrayUnique,
} from 'class-validator';
import { Type } from 'class-transformer';

export class QuestionAnswerDto {
  @IsString()
  questionId: string;

  // Selected option index (0, 1, 2, 3...) or -1 if unselected (for single-choice MCQ)
  @IsNumber()
  @IsOptional()
  selectedAnswer?: number;

  // Selected option indices for multiple-choice questions
  @IsArray()
  @IsOptional()
  selectedAnswers?: number[];

  @IsNumber()
  @IsOptional()
  timeSpentSeconds?: number;

  @IsString()
  @IsOptional()
  status?: string; // 'answered' | 'marked_for_review' | 'skipped'

  @IsString()
  @IsOptional()
  code?: string;

  @IsString()
  @IsOptional()
  language?: string;
  // NOTE (AUD-002): testCasesPassed, totalTestCases, isCorrect, and marksAwarded
  // are deliberately excluded. All evaluation is performed strictly server-side.
}

export class ProctoringViolationDto {
  @IsString()
  type: string; // 'tab_switch' | 'fullscreen_exit' | 'copy_paste_attempt'

  @IsOptional()
  timestamp?: string;

  @IsString()
  @IsOptional()
  details?: string;
}

export class SubmitAssessmentDto {
  @IsArray()
  @ArrayUnique((o: QuestionAnswerDto) => o?.questionId, {
    message: 'Duplicate question responses are not permitted in assessment submission',
  })
  @ValidateNested({ each: true })
  @Type(() => QuestionAnswerDto)
  responses: QuestionAnswerDto[];

  @IsNumber()
  @IsOptional()
  timeSpentSeconds?: number;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ProctoringViolationDto)
  violations?: ProctoringViolationDto[];

  @IsString()
  @IsOptional()
  idempotencyKey?: string;

  @IsNumber()
  @IsOptional()
  clientSubmittedAtMs?: number;

  @IsNumber()
  @IsOptional()
  currentQuestionIndex?: number;

  @IsString()
  @IsOptional()
  targetQuestionId?: string;
}

export class VerifyIdentityDto {
  @IsArray()
  @ArrayMaxSize(512)
  @IsNumber({}, { each: true })
  faceDescriptor: number[];

  @IsOptional()
  @IsString()
  @MaxLength(4_000_000)
  snapshot?: string;
}

export class RecordViolationDto {
  @IsString()
  @MaxLength(80)
  type: string;

  @IsOptional()
  @IsISO8601()
  timestamp?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  details?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(4_000_000)
  evidenceSnapshot?: string;
}

export class ProctorCaptureDto {
  @IsIn(['screen'])
  type: string;

  @IsString()
  @MaxLength(4_000_000)
  image: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  filename?: string;

  @IsISO8601()
  timestamp: string;
}
