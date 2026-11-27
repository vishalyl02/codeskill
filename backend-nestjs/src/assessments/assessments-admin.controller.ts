import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AssessmentsService } from './assessments.service';
import { CreateAssessmentDto } from './dto/create-assessment.dto';
import {
  UpdateAssessmentDto,
  UpdateAssessmentStatusDto,
} from './dto/update-assessment.dto';
import {
  UpsertAccommodationDto,
  GrantExtraTimeDto,
  GradeHoldDto,
} from './dto/accommodations.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AssessmentAuthorGuard } from '../common/guards/assessment-author.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Admin Assessments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AssessmentAuthorGuard)
@Controller('admin/assessments')
export class AssessmentsAdminController {
  constructor(private readonly assessmentsService: AssessmentsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new MCQ assessment / exam' })
  async create(
    @Body() dto: CreateAssessmentDto,
    @CurrentUser() adminUser: any,
    @Req() req: any,
  ) {
    const ip = req.ip || req.connection?.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';
    return this.assessmentsService.create(dto, adminUser, ip, userAgent);
  }

  @Get()
  @ApiOperation({ summary: 'List all assessments with filters' })
  async findAll(
    @Query() query: any,
    @CurrentUser() adminUser: any,
  ) {
    return this.assessmentsService.findAll(query, adminUser);
  }

  @Get('targeting-options')
  @ApiOperation({
    summary:
      'Get distinct student targeting options (years, semesters, sections, batches) from active students',
  })
  async getTargetingOptions() {
    return this.assessmentsService.getTargetingOptions();
  }

  @Get('students-search')
  @ApiOperation({
    summary: 'Search students by name, email, uid with optional cohort filters',
  })
  async searchStudents(@Query() query: any) {
    return this.assessmentsService.searchStudents(query);
  }

  @Post('resolve-student-uids')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Match assessment assignment UIDs from a CSV or Excel file' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 1024 * 1024, files: 1 },
  }))
  async resolveStudentUids(@UploadedFile() file: Express.Multer.File) {
    return this.assessmentsService.resolveStudentUids(file);
  }

  @Post('preview-target-audience')
  @ApiOperation({
    summary:
      'Preview eligible audience count and sample students for targeting criteria',
  })
  async previewTargetAudience(@Body() dto: any) {
    return this.assessmentsService.previewTargetAudience(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get assessment details with populated questions' })
  async findById(
    @Param('id') id: string,
    @CurrentUser() adminUser: any,
  ) {
    return this.assessmentsService.findById(id, adminUser);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update assessment details, schedule, or timings' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAssessmentDto,
    @CurrentUser() adminUser: any,
  ) {
    return this.assessmentsService.update(id, dto, adminUser);
  }

  @Put(':id/status')
  @ApiOperation({
    summary:
      'Toggle or update assessment status (published, draft, completed, etc.)',
  })
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateAssessmentStatusDto,
    @CurrentUser() adminUser: any,
  ) {
    return this.assessmentsService.updateStatus(id, dto.status, adminUser);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Archive assessment' })
  async delete(@Param('id') id: string, @CurrentUser() adminUser: any) {
    return this.assessmentsService.delete(id, adminUser);
  }

  @Get(':id/results')
  @ApiOperation({
    summary: 'Get student attempt results and summary analytics',
  })
  async getResults(@Param('id') id: string, @CurrentUser() adminUser: any) {
    return this.assessmentsService.getAssessmentResults(id, adminUser);
  }

  @Post(':id/create-practice-mock')
  @ApiOperation({ summary: 'Create a 5-minute practice mock from this assessment' })
  async createPracticeMock(@Param('id') id: string, @CurrentUser() adminUser: any) {
    return this.assessmentsService.createPracticeMock(id, adminUser);
  }

  @Get(':id/accommodations')
  @ApiOperation({ summary: 'Get candidate accommodations for this assessment' })
  async getAccommodations(@Param('id') id: string) {
    return this.assessmentsService.getAccommodations(id);
  }

  @Post(':id/accommodations')
  @ApiOperation({ summary: 'Upsert candidate accommodation' })
  async upsertAccommodation(
    @Param('id') id: string,
    @Body() dto: UpsertAccommodationDto,
    @CurrentUser() adminUser: any,
  ) {
    return this.assessmentsService.upsertAccommodation(id, dto, adminUser);
  }

  @Delete(':id/accommodations/:userId')
  @ApiOperation({ summary: 'Delete candidate accommodation' })
  async deleteAccommodation(
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    return this.assessmentsService.deleteAccommodation(id, userId);
  }

  @Get(':id/invigilation-roster')
  @ApiOperation({ summary: 'Get live classroom invigilation roster' })
  async getInvigilationRoster(@Param('id') id: string) {
    return this.assessmentsService.getInvigilationRoster(id);
  }

  @Post(':id/invigilation-grant-time')
  @ApiOperation({ summary: 'Grant extra exam time to candidate' })
  async grantExtraTime(
    @Param('id') id: string,
    @Body() dto: GrantExtraTimeDto,
    @CurrentUser() adminUser: any,
  ) {
    return this.assessmentsService.grantExtraTime(id, dto, adminUser);
  }

  @Post(':id/invigilation-grade-hold')
  @ApiOperation({ summary: 'Flag or release grade hold on attempt' })
  async holdGrade(
    @Param('id') id: string,
    @Body() dto: GradeHoldDto,
    @CurrentUser() adminUser: any,
  ) {
    return this.assessmentsService.holdGrade(id, dto, adminUser);
  }

  @Get(':id/friction-analytics')
  @ApiOperation({ summary: 'Get per-question friction and struggle analytics' })
  async getFrictionAnalytics(@Param('id') id: string) {
    return this.assessmentsService.getFrictionAnalytics(id);
  }
}
