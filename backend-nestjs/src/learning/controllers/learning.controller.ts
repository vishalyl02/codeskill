import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { LearningService } from '../services/learning.service';
import { PracticeService } from '../services/practice.service';
import { GamificationService } from '../services/gamification.service';
import { CertificationService } from '../services/certification.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  SubmitExerciseDto,
  TrackTimeSpentDto,
  CompleteLessonDto,
} from '../dto/course.dto';

@ApiTags('Learning')
@Controller('learning')
export class LearningController {
  constructor(
    private readonly learningService: LearningService,
    private readonly practiceService: PracticeService,
    private readonly gamificationService: GamificationService,
    private readonly certService: CertificationService,
  ) {}

  @Get('paths')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Browse published learning paths' })
  async getPaths(
    @CurrentUser('id') studentId: string | undefined,
    @Query('search') search?: string,
    @Query('difficulty') difficulty?: string,
    @Query('tag') tag?: string,
  ) {
    return this.learningService.getPublishedPaths(studentId, {
      search,
      difficulty,
      tag,
    });
  }

  @Get('paths/:slug')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'View learning path curriculum and details' })
  async getPathBySlug(
    @Param('slug') slug: string,
    @CurrentUser('id') studentId: string | undefined,
  ) {
    return this.learningService.getPathBySlug(slug, studentId);
  }

  @Post('paths/:id/enroll')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Enroll student in a learning path' })
  async enrollPath(
    @Param('id') pathId: string,
    @CurrentUser('id') studentId: string,
  ) {
    return this.learningService.enrollStudent(pathId, studentId);
  }

  @Get('courses/:id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get course curriculum and lesson progress' })
  async getCourse(
    @Param('id') courseId: string,
    @CurrentUser('id') studentId: string,
  ) {
    return this.learningService.getCourseDetails(courseId, studentId);
  }

  @Get('lessons/:id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get structured reading lesson content' })
  async getLesson(
    @Param('id') lessonId: string,
    @CurrentUser('id') studentId: string,
  ) {
    return this.learningService.getLessonContent(lessonId, studentId);
  }

  @Post('lessons/:id/time-spent')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Track student study time on a module lesson' })
  async trackTimeSpent(
    @Param('id') lessonId: string,
    @CurrentUser('id') studentId: string,
    @Body() dto: TrackTimeSpentDto,
  ) {
    return this.practiceService.trackTimeSpent(lessonId, studentId, dto.seconds);
  }

  @Get('lessons/:id/completion-status')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Check detailed requirements and reasons for module completion' })
  async getLessonCompletionStatus(
    @Param('id') lessonId: string,
    @CurrentUser('id') studentId: string,
  ) {
    return this.practiceService.checkLessonCompletion(lessonId, studentId);
  }

  @Post('lessons/:id/complete')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Mark verified lesson complete' })
  async completeLesson(
    @Param('id') lessonId: string,
    @CurrentUser('id') studentId: string,
    @Body() dto?: CompleteLessonDto,
  ) {
    return this.practiceService.completeLesson(lessonId, studentId, dto?.timeSpentSeconds);
  }

  @Post('exercises/:id/submit')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Submit practice exercise (code or quiz)' })
  async submitExercise(
    @Param('id') exerciseId: string,
    @CurrentUser('id') studentId: string,
    @Body() dto: SubmitExerciseDto,
  ) {
    return this.practiceService.submitExercise(exerciseId, studentId, dto);
  }

  @Get('me/progress')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Student active learning paths and progress' })
  async getMyProgress(@CurrentUser('id') studentId: string) {
    return this.learningService.getStudentProgressDashboard(studentId);
  }

  @Get('me/achievements')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Student XP, skill level, and earned badges' })
  async getMyAchievements(@CurrentUser('id') studentId: string) {
    return this.gamificationService.getStudentAchievements(studentId);
  }

  @Get('me/certificates')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Student earned digital certificates' })
  async getMyCertificates(@CurrentUser('id') studentId: string) {
    return this.certService.getStudentCertificates(studentId);
  }

  @Post('paths/:id/certify')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Evaluate and issue certificate upon completion' })
  async issueCertificate(
    @Param('id') pathId: string,
    @CurrentUser('id') studentId: string,
  ) {
    return this.certService.issueCertificate(pathId, studentId);
  }

  @Post('playground/run')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Real-time live compiler runner for sandbox and practice' })
  async runPlaygroundCode(
    @Body() dto: { code: string; language: string; stdin?: string },
  ) {
    return this.practiceService.runPlaygroundCode(dto);
  }
}
