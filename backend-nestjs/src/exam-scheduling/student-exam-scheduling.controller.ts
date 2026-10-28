import {
  Controller,
  Get,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ExamSchedulingService } from './exam-scheduling.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Student - Exam Scheduling & Time Slots')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('exam-scheduling')
export class StudentExamSchedulingController {
  constructor(private readonly schedulingService: ExamSchedulingService) {}

  @Get('my-schedule')
  @ApiOperation({ summary: 'Get assigned examination schedule, slots, countdowns, and eligibility' })
  async getMySchedule(@CurrentUser() studentUser: any) {
    return this.schedulingService.getStudentSchedule(studentUser);
  }

  @Get('verify-access/:assessmentId')
  @ApiOperation({ summary: 'Authoritative check before entering examination session' })
  async verifyStudentAccess(
    @Param('assessmentId') assessmentId: string,
    @CurrentUser() studentUser: any,
  ) {
    return this.schedulingService.verifyStudentAccess(assessmentId, studentUser);
  }
}
