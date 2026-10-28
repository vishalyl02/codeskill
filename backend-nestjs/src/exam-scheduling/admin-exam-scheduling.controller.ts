import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  Res,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { ExamSchedulingService } from './exam-scheduling.service';
import { CreateExamScheduleDto } from './dto/create-exam-schedule.dto';
import { UpdateExamScheduleDto } from './dto/update-exam-schedule.dto';
import { CreateExamSlotDto } from './dto/create-exam-slot.dto';
import { AutoGenerateSlotsDto } from './dto/auto-generate-slots.dto';
import {
  AllocateStudentsDto,
  ReassignStudentSlotDto,
  BatchReassignSlotDto,
} from './dto/allocate-students.dto';
import {
  BulkAssignStudentsDto,
  StudentFilterCriteriaDto,
} from './dto/bulk-assign-students.dto';
import {
  RevokeStudentAccessDto,
  GrantExceptionAccessDto,
  ReinstateStudentAccessDto,
} from './dto/access-override.dto';
import { QueryExamSchedulesDto } from './dto/query-exam-schedules.dto';
import { QueryStudentAssignmentsDto } from './dto/query-student-assignments.dto';
import { CreateSavedGroupDto } from './dto/create-saved-group.dto';
import { MatchIdentifiersDto } from './dto/match-identifiers.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Admin - Exam Scheduling & Eligibility')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/exam-scheduling')
export class AdminExamSchedulingController {
  constructor(private readonly schedulingService: ExamSchedulingService) {}

  // =========================================================================
  // 1. STATIC SUB-ROUTES (Must precede dynamic ':id' to prevent route collision)
  // =========================================================================

  @Get(['schedules', ''])
  @ApiOperation({ summary: 'List all exam schedules with metrics and filters' })
  async findAllSchedules(@Query() query: QueryExamSchedulesDto) {
    return this.schedulingService.findAllSchedules(query);
  }

  @Post(['schedules', ''])
  @ApiOperation({ summary: 'Create a new exam schedule draft' })
  async createSchedule(
    @Body() dto: CreateExamScheduleDto,
    @CurrentUser() adminUser: any,
    @Req() req: any,
  ) {
    const ip = req.ip || req.connection?.remoteAddress || '';
    return this.schedulingService.createSchedule(dto, adminUser, ip);
  }

  // --- Student Search & Filter Count ---

  @Post('students/search')
  @ApiOperation({ summary: 'Search and filter student population (POST)' })
  async searchStudentsPost(
    @Body() body: any,
  ) {
    const criteria = body?.criteria || body || {};
    const page = Number(body?.page) || 1;
    const limit = Number(body?.limit) || 20;
    return this.schedulingService.searchStudents(
      criteria,
      page,
      limit,
    );
  }

  @Get('students/search')
  @ApiOperation({ summary: 'Search and filter student population with query params (GET)' })
  async searchStudentsGet(
    @Query() criteria: StudentFilterCriteriaDto,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.schedulingService.searchStudents(
      criteria,
      Number(page) || 1,
      Number(limit) || 20,
    );
  }

  @Post(['students/count', 'students/preview-count'])
  @ApiOperation({ summary: 'Get live count of students matching filter criteria' })
  async previewStudentCount(@Body() body: any) {
    const criteria = body?.criteria || body || {};
    return this.schedulingService.previewStudentCount(criteria);
  }

  // --- Saved Groups ---

  @Get('saved-groups')
  @ApiOperation({ summary: 'List reusable student cohorts' })
  async getSavedGroups() {
    return this.schedulingService.getSavedGroups();
  }

  @Post('saved-groups')
  @ApiOperation({ summary: 'Create reusable student cohort / saved group' })
  async createSavedGroup(
    @Body() dto: CreateSavedGroupDto,
    @CurrentUser() adminUser: any,
  ) {
    return this.schedulingService.createSavedGroup(dto, adminUser);
  }

  @Delete('saved-groups/:id')
  @ApiOperation({ summary: 'Delete reusable student cohort' })
  async deleteSavedGroup(@Param('id') id: string) {
    return this.schedulingService.deleteSavedGroup(id);
  }

  // --- Global Audit Logs ---

  @Get('audit-logs')
  @ApiOperation({ summary: 'Get global audit logs of scheduling actions' })
  async getGlobalAuditLogs(
    @Query('scheduleId') scheduleId?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.schedulingService.getAuditLogs(
      scheduleId,
      Number(page) || 1,
      Number(limit) || 50,
    );
  }

  // =========================================================================
  // 2. SCHEDULE SPECIFIC DYNAMIC ROUTES (Both with & without 'schedules/' prefix)
  // =========================================================================

  @Get(['schedules/:id', ':id'])
  @ApiOperation({ summary: 'Get schedule details with slots and statistics' })
  async findScheduleById(@Param('id') id: string) {
    return this.schedulingService.findScheduleById(id);
  }

  @Patch(['schedules/:id', ':id'])
  @ApiOperation({ summary: 'Update exam schedule metadata or timing policies' })
  async updateSchedule(
    @Param('id') id: string,
    @Body() dto: UpdateExamScheduleDto,
    @CurrentUser() adminUser: any,
  ) {
    return this.schedulingService.updateSchedule(id, dto, adminUser);
  }

  @Put(['schedules/:id', ':id'])
  @ApiOperation({ summary: 'Update exam schedule metadata or timing policies (PUT fallback)' })
  async updateSchedulePut(
    @Param('id') id: string,
    @Body() dto: UpdateExamScheduleDto,
    @CurrentUser() adminUser: any,
  ) {
    return this.schedulingService.updateSchedule(id, dto, adminUser);
  }

  @Post(['schedules/:id/publish', ':id/publish'])
  @ApiOperation({ summary: 'Validate capacity and publish exam schedule' })
  async publishSchedule(@Param('id') id: string, @CurrentUser() adminUser: any) {
    return this.schedulingService.publishSchedule(id, adminUser);
  }

  @Post(['schedules/:id/cancel', ':id/cancel'])
  @ApiOperation({ summary: 'Cancel an exam schedule safely' })
  async cancelSchedule(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @CurrentUser() adminUser: any,
  ) {
    return this.schedulingService.cancelSchedule(id, reason, adminUser);
  }

  @Delete(['schedules/:id', ':id'])
  @ApiOperation({ summary: 'Delete an unstarted exam schedule draft' })
  async deleteSchedule(@Param('id') id: string, @CurrentUser() adminUser: any) {
    return this.schedulingService.deleteSchedule(id, adminUser);
  }

  // --- CSV Import & Smart Bulk Matching ---

  @Post(['schedules/:id/import-csv', ':id/import-csv'])
  @ApiOperation({ summary: 'Upload and validate student CSV file for schedule' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async importCsv(
    @Param('id') scheduleId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file || !file.buffer) {
      throw new BadRequestException('Please provide a valid CSV file');
    }
    return this.schedulingService.validateCsv(scheduleId, file.buffer);
  }

  @Post(['schedules/:id/match-identifiers', ':id/match-identifiers'])
  @ApiOperation({
    summary:
      'Smart bulk student matcher: Accepts uploaded CSV/Excel or pasted text or JSON identifiers, matches against DB and detects duplicates/conflicts',
  })
  @ApiConsumes('multipart/form-data', 'application/json')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 15 * 1024 * 1024 },
    }),
  )
  async matchIdentifiers(
    @Param('id') scheduleId: string,
    @UploadedFile() file?: Express.Multer.File,
    @Body() body?: any,
  ) {
    const rawText = body?.rawText;
    let identifiers = body?.identifiers;

    if (typeof identifiers === 'string') {
      try {
        identifiers = JSON.parse(identifiers);
      } catch (e) {
        // keep as is
      }
    }

    return this.schedulingService.matchIdentifiers(scheduleId, {
      fileBuffer: file?.buffer,
      fileName: file?.originalname,
      rawText,
      identifiers,
    });
  }

  @Post(['schedules/:id/export-match-errors', ':id/export-match-errors'])
  @ApiOperation({ summary: 'Export unmatched and conflicting records as CSV report' })
  async exportMatchErrors(
    @Param('id') scheduleId: string,
    @Body()
    body: {
      unmatchedRecords: any[];
      conflictingRecords: any[];
      duplicateRecords: any[];
    },
    @Res() res: Response,
  ) {
    const csvContent = this.schedulingService.generateImportErrorReportCsv(body || {
      unmatchedRecords: [],
      conflictingRecords: [],
      duplicateRecords: [],
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="import-errors-${scheduleId}-${Date.now()}.csv"`,
    );
    res.send(csvContent);
  }

  // --- Slot Management ---

  @Post(['schedules/:id/slots', ':id/slots'])
  @ApiOperation({ summary: 'Create manual examination slot' })
  async createSlot(
    @Param('id') scheduleId: string,
    @Body() dto: CreateExamSlotDto,
    @CurrentUser() adminUser: any,
  ) {
    return this.schedulingService.createSlot(scheduleId, dto, adminUser);
  }

  @Post(['schedules/:id/slots/auto-generate', ':id/slots/auto-generate'])
  @ApiOperation({ summary: 'Auto-generate slots across days and capacity bounds' })
  async autoGenerateSlots(
    @Param('id') scheduleId: string,
    @Body() dto: AutoGenerateSlotsDto,
    @CurrentUser() adminUser: any,
  ) {
    return this.schedulingService.autoGenerateSlots(scheduleId, dto, adminUser);
  }

  @Patch(['schedules/:id/slots/:slotId', ':id/slots/:slotId'])
  @ApiOperation({ summary: 'Update an existing slot' })
  async updateSlot(
    @Param('id') scheduleId: string,
    @Param('slotId') slotId: string,
    @Body() dto: Partial<CreateExamSlotDto>,
    @CurrentUser() adminUser: any,
  ) {
    return this.schedulingService.updateSlot(scheduleId, slotId, dto, adminUser);
  }

  @Put(['schedules/:id/slots/:slotId', ':id/slots/:slotId'])
  @ApiOperation({ summary: 'Update an existing slot (PUT fallback)' })
  async updateSlotPut(
    @Param('id') scheduleId: string,
    @Param('slotId') slotId: string,
    @Body() dto: Partial<CreateExamSlotDto>,
    @CurrentUser() adminUser: any,
  ) {
    return this.schedulingService.updateSlot(scheduleId, slotId, dto, adminUser);
  }

  @Delete(['schedules/:id/slots/:slotId', ':id/slots/:slotId'])
  @ApiOperation({ summary: 'Delete an unstarted slot' })
  async deleteSlot(
    @Param('id') scheduleId: string,
    @Param('slotId') slotId: string,
    @CurrentUser() adminUser: any,
  ) {
    return this.schedulingService.deleteSlot(scheduleId, slotId, adminUser);
  }

  // --- Allocation & Student Assignment ---

  @Post([
    'schedules/:id/assignments/bulk',
    'schedules/:id/assignments/bulk-assign',
    ':id/assignments/bulk',
    ':id/assignments/bulk-assign',
  ])
  @ApiOperation({ summary: 'Bulk assign students to eligibility pool' })
  async bulkAssignStudents(
    @Param('id') scheduleId: string,
    @Body() dto: BulkAssignStudentsDto,
    @CurrentUser() adminUser: any,
  ) {
    return this.schedulingService.bulkAssignStudents(scheduleId, dto, adminUser);
  }

  @Post([
    'schedules/:id/allocate-slots',
    'schedules/:id/allocate',
    ':id/allocate-slots',
    ':id/allocate',
  ])
  @ApiOperation({ summary: 'Automatically distribute eligible students into slots' })
  async allocateStudents(
    @Param('id') scheduleId: string,
    @Body() dto: AllocateStudentsDto,
    @CurrentUser() adminUser: any,
  ) {
    return this.schedulingService.allocateStudentsToSlots(scheduleId, dto, adminUser);
  }

  @Post(['schedules/:id/reassign-slot', ':id/reassign-slot'])
  @ApiOperation({ summary: 'Move individual student to a different slot' })
  async reassignStudentSlot(
    @Param('id') scheduleId: string,
    @Body() dto: ReassignStudentSlotDto,
    @CurrentUser() adminUser: any,
  ) {
    return this.schedulingService.reassignStudentSlot(scheduleId, dto, adminUser);
  }

  // --- Eligibility, Overrides & Exceptions ---

  @Get(['schedules/:id/assignments', ':id/assignments'])
  @ApiOperation({ summary: 'Get paginated list of student eligibility assignments' })
  async getAssignments(
    @Param('id') scheduleId: string,
    @Query() query: QueryStudentAssignmentsDto,
  ) {
    return this.schedulingService.getAssignments(scheduleId, query);
  }

  @Post([
    'schedules/:id/access/revoke',
    'schedules/:id/assignments/revoke',
    ':id/access/revoke',
    ':id/assignments/revoke',
  ])
  @ApiOperation({ summary: 'Revoke student access with mandatory reason and audit log' })
  async revokeAccess(
    @Param('id') scheduleId: string,
    @Body() dto: RevokeStudentAccessDto,
    @CurrentUser() adminUser: any,
  ) {
    return this.schedulingService.revokeAccess(scheduleId, dto, adminUser);
  }

  @Post([
    'schedules/:id/access/grant-exception',
    'schedules/:id/assignments/grant-exception',
    ':id/access/grant-exception',
    ':id/assignments/grant-exception',
  ])
  @ApiOperation({ summary: 'Grant exceptional access or extended time window' })
  async grantException(
    @Param('id') scheduleId: string,
    @Body() dto: GrantExceptionAccessDto,
    @CurrentUser() adminUser: any,
  ) {
    return this.schedulingService.grantException(scheduleId, dto, adminUser);
  }

  @Post([
    'schedules/:id/access/reinstate',
    'schedules/:id/assignments/reinstate',
    ':id/access/reinstate',
    ':id/assignments/reinstate',
  ])
  @ApiOperation({ summary: 'Reinstate previously revoked student eligibility' })
  async reinstateAccess(
    @Param('id') scheduleId: string,
    @Body() dto: ReinstateStudentAccessDto,
    @CurrentUser() adminUser: any,
  ) {
    return this.schedulingService.reinstateAccess(scheduleId, dto, adminUser);
  }

  // --- Attendance, Attempts & Export ---

  @Get(['schedules/:id/attendance', ':id/attendance'])
  @ApiOperation({ summary: 'Get real-time exam attendance, in-progress, and completion metrics' })
  async getAttendanceSummary(@Param('id') scheduleId: string) {
    return this.schedulingService.getAttendanceSummary(scheduleId);
  }

  @Get(['schedules/:id/export-csv', ':id/export-csv'])
  @ApiOperation({ summary: 'Download complete student assignment & attendance CSV report' })
  async exportCsvReport(
    @Param('id') scheduleId: string,
    @Res() res: Response,
  ) {
    const csvContent = await this.schedulingService.exportCsvReport(scheduleId);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="exam_schedule_${scheduleId}_report.csv"`,
    );
    res.send(csvContent);
  }

  // --- Schedule Audit Logs ---

  @Get(['schedules/:id/audit-logs', ':id/audit-logs'])
  @ApiOperation({ summary: 'Get chronological audit trail of scheduling actions for a schedule' })
  async getScheduleAuditLogs(
    @Param('id') scheduleId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.schedulingService.getAuditLogs(
      scheduleId,
      Number(page) || 1,
      Number(limit) || 50,
    );
  }
}
