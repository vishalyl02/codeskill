import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateFacultyAssignmentDto {
  @ApiProperty({ description: 'Batch ID' })
  @IsNotEmpty()
  @IsString()
  batchId: string;

  @ApiProperty({ description: 'Course code (e.g. CS101)', example: 'CS101' })
  @IsNotEmpty()
  @IsString()
  courseCode: string;

  @ApiPropertyOptional({ description: 'Section name (optional)', example: 'Section A' })
  @IsOptional()
  @IsString()
  section?: string;
}
