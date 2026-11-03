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
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AssessmentsService } from './assessments.service';
import { CreateAssessmentDto } from './dto/create-assessment.dto';
import {
  UpdateAssessmentDto,
  UpdateAssessmentStatusDto,
} from './dto/update-assessment.dto';
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
  async findAll(@Query() query: any) {
    return this.assessmentsService.findAll(query);
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
  async findById(@Param('id') id: string) {
    return this.assessmentsService.findById(id);
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
}
