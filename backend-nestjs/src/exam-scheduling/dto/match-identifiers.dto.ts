import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsArray } from 'class-validator';

export class SingleIdentifierInputDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  uid?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  email?: string;
}

export class MatchIdentifiersDto {
  @ApiPropertyOptional({ description: 'Pasted text containing UIDs, emails, or comma/tab separated lines' })
  @IsOptional()
  @IsString()
  rawText?: string;

  @ApiPropertyOptional({ type: [SingleIdentifierInputDto] })
  @IsOptional()
  @IsArray()
  identifiers?: SingleIdentifierInputDto[];
}

export interface MatchedStudentDto {
  studentId: string;
  uid: string;
  name: string;
  email: string;
  department?: string;
  semester?: number | null;
  section?: string;
  alreadyAssigned: boolean;
  assignedSlotName?: string;
}

export interface UnmatchedRecordDto {
  rowNumber: number;
  inputUid?: string;
  inputEmail?: string;
  reason: string;
}

export interface ConflictingRecordDto {
  rowNumber: number;
  inputUid: string;
  inputEmail: string;
  uidMatchName: string;
  emailMatchName: string;
  reason: string;
}

export interface DuplicateRecordDto {
  rowNumber: number;
  identifier: string;
}

export interface IdentifierMatchSummaryDto {
  totalInputRows: number;
  uniqueIdentifiersProcessed: number;
  matchedStudentsCount: number;
  alreadyAssignedCount: number;
  duplicateEntriesCount: number;
  unmatchedCount: number;
  conflictCount: number;
}

export interface IdentifierMatchResultDto {
  summary: IdentifierMatchSummaryDto;
  matchedStudents: MatchedStudentDto[];
  unmatchedRecords: UnmatchedRecordDto[];
  conflictingRecords: ConflictingRecordDto[];
  duplicateRecords: DuplicateRecordDto[];
}
