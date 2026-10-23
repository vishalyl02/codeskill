import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AdminLearningService } from '../services/admin-learning.service';
import { CertificationService } from '../services/certification.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  CreateLearningPathDto,
  UpdateLearningPathDto,
} from '../dto/learning-path.dto';
import {
  CreateCourseDto,
  CreateCourseModuleDto,
  UpdateCourseModuleDto,
  CreateLessonDto,
  CreateCourseExerciseDto,
} from '../dto/course.dto';
import {
  CreateBadgeDto,
  CreateCertificateTemplateDto,
  RevokeCertificateDto,
} from '../dto/badge-and-cert.dto';

@ApiTags('Admin Learning')
@Controller('admin/learning')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminLearningController {
  constructor(
    private readonly adminService: AdminLearningService,
    private readonly certService: CertificationService,
  ) {}

  @Get('overview')
  @ApiOperation({ summary: 'Learning overview metrics for admin dashboard' })
  async getOverview() {
    return this.adminService.getLearningAnalytics();
  }

  // ── Paths ───────────────────────────────────────────────────────────────────

  @Get('paths')
  @ApiOperation({ summary: 'List all paths for admin' })
  async getAllPaths() {
    return this.adminService.getAllPaths();
  }

  @Post('paths')
  @ApiOperation({ summary: 'Create a new learning path' })
  async createPath(@Body() dto: CreateLearningPathDto) {
    return this.adminService.createPath(dto);
  }

  @Get('paths/:id')
  @ApiOperation({ summary: 'Get learning path details with courses and modules' })
  async getPathDetails(@Param('id') id: string) {
    return this.adminService.getPathDetails(id);
  }

  @Patch('paths/:id')
  @ApiOperation({ summary: 'Update a learning path' })
  async updatePath(
    @Param('id') id: string,
    @Body() dto: UpdateLearningPathDto,
  ) {
    return this.adminService.updatePath(id, dto);
  }

  @Delete('paths/:id')
  @ApiOperation({ summary: 'Delete a learning path' })
  async deletePath(@Param('id') id: string) {
    return this.adminService.deletePath(id);
  }

  @Post('paths/:id/publish')
  @ApiOperation({ summary: 'Publish learning path revision' })
  async publishPath(@Param('id') id: string) {
    return this.adminService.publishPath(id);
  }

  // ── Courses ─────────────────────────────────────────────────────────────────

  @Get('courses')
  @ApiOperation({ summary: 'List all courses' })
  async getAllCourses() {
    return this.adminService.getAllCourses();
  }

  @Post('courses')
  @ApiOperation({ summary: 'Create a new course' })
  async createCourse(@Body() dto: CreateCourseDto) {
    return this.adminService.createCourse(dto);
  }

  @Patch('courses/:id')
  @ApiOperation({ summary: 'Update a course' })
  async updateCourse(
    @Param('id') id: string,
    @Body() dto: Partial<CreateCourseDto>,
  ) {
    return this.adminService.updateCourse(id, dto);
  }

  @Delete('courses/:id')
  @ApiOperation({ summary: 'Delete a course' })
  async deleteCourse(@Param('id') id: string) {
    return this.adminService.deleteCourse(id);
  }

  @Post('courses/:id/modules')
  @ApiOperation({ summary: 'Add module to course' })
  async createModule(
    @Param('id') courseId: string,
    @Body() dto: CreateCourseModuleDto,
  ) {
    return this.adminService.createModule(courseId, dto);
  }

  @Patch('modules/:id')
  @ApiOperation({ summary: 'Update course module details and study time' })
  async updateModule(
    @Param('id') moduleId: string,
    @Body() dto: UpdateCourseModuleDto,
  ) {
    return this.adminService.updateModule(moduleId, dto);
  }

  @Put('modules/:id')
  @ApiOperation({ summary: 'Update course module details and study time' })
  async putModule(
    @Param('id') moduleId: string,
    @Body() dto: UpdateCourseModuleDto,
  ) {
    return this.adminService.updateModule(moduleId, dto);
  }

  @Delete('modules/:id')
  @ApiOperation({ summary: 'Delete course module' })
  async deleteModule(@Param('id') moduleId: string) {
    return this.adminService.deleteModule(moduleId);
  }

  @Post('modules/:id/lessons')
  @ApiOperation({ summary: 'Add structured lesson to module' })
  async createLesson(
    @Param('id') moduleId: string,
    @Body() dto: CreateLessonDto,
  ) {
    return this.adminService.createLesson(moduleId, dto);
  }

  @Patch('lessons/:id')
  @ApiOperation({ summary: 'Update a lesson' })
  async updateLesson(
    @Param('id') id: string,
    @Body() dto: Partial<CreateLessonDto>,
  ) {
    return this.adminService.updateLesson(id, dto);
  }

  @Delete('lessons/:id')
  @ApiOperation({ summary: 'Delete a lesson' })
  async deleteLesson(@Param('id') id: string) {
    return this.adminService.deleteLesson(id);
  }

  @Post('lessons/:id/exercises')
  @ApiOperation({ summary: 'Attach practice exercise to lesson' })
  async createExercise(
    @Param('id') lessonId: string,
    @Body() dto: CreateCourseExerciseDto,
  ) {
    return this.adminService.createExercise(lessonId, dto);
  }

  @Delete('exercises/:id')
  @ApiOperation({ summary: 'Delete a practice exercise' })
  async deleteExercise(@Param('id') id: string) {
    return this.adminService.deleteExercise(id);
  }

  // ── Badges & Certificates ───────────────────────────────────────────────────

  @Get('badges')
  @ApiOperation({ summary: 'List all badge definitions' })
  async getBadges() {
    return this.adminService.getAllBadges();
  }

  @Post('badges')
  @ApiOperation({ summary: 'Create a badge definition' })
  async createBadge(@Body() dto: CreateBadgeDto) {
    return this.adminService.createBadge(dto);
  }

  @Get('certificates')
  @ApiOperation({ summary: 'List all issued certificates for admin' })
  async getCertificates() {
    return this.adminService.getAllCertificates();
  }

  @Get('certificate-templates')
  @ApiOperation({ summary: 'List all certificate templates' })
  async getTemplates() {
    return this.adminService.getCertificateTemplates();
  }

  @Post('certificate-templates')
  @ApiOperation({ summary: 'Create certificate template' })
  async createTemplate(@Body() dto: CreateCertificateTemplateDto) {
    return this.adminService.createCertificateTemplate(dto);
  }

  @Post('certificates/:id/revoke')
  @ApiOperation({ summary: 'Revoke an issued certificate' })
  async revokeCertificate(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: RevokeCertificateDto,
  ) {
    return this.certService.revokeCertificate(id, adminId, dto.reason);
  }
}
