import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ContestsService } from './contests.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { GetContestResultsQueryDto } from './dto/get-contest-results.dto';

@ApiTags('Contests')
@Controller('contests')
export class ContestsController {
  constructor(private readonly contestsService: ContestsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all public contests' })
  async getContests() {
    return this.contestsService.getContests();
  }

  @Get('private')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get published password-protected contests' })
  async getPrivateContests() {
    return this.contestsService.getPrivateContests();
  }

  @Get(':slug/leaderboard')
  async leaderboard(@Param('slug') slug: string) {
    return this.contestsService.leaderboard(slug);
  }

  @Get(':slug/member-leaderboard')
  @UseGuards(JwtAuthGuard)
  async memberLeaderboard(
    @Param('slug') slug: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.contestsService.leaderboard(slug, userId);
  }

  @Get(':id/registration')
  @UseGuards(JwtAuthGuard)
  async registration(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.contestsService.registration(id, userId);
  }

  @Get(':id/start-context')
  @UseGuards(JwtAuthGuard)
  async startContext(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.contestsService.getStartContext(id, userId);
  }

  @Get(':id/results')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary:
      'Get paginated contest results, problem matrix, and personal scorecard',
  })
  async getResults(
    @Param('id') id: string,
    @Query() query: GetContestResultsQueryDto,
    @CurrentUser() user?: { id: string; role: string },
  ) {
    return this.contestsService.getResults(id, query, user?.id);
  }

  @Get(':id/editorials')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary:
      'Get official contest editorials and reference solutions (security-gated)',
  })
  async getEditorials(
    @Param('id') id: string,
    @CurrentUser() user?: { id: string; role: string },
  ) {
    return this.contestsService.getEditorials(id, user);
  }

  @Post(':id/start')
  @UseGuards(JwtAuthGuard)
  async startAttempt(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body('password') password?: string,
  ) {
    return this.contestsService.startAttempt(id, userId, password);
  }

  @Post(':id/submit')
  @UseGuards(JwtAuthGuard)
  async submitAttempt(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body('sessionId') sessionId: string,
  ) {
    return this.contestsService.submitAttempt(id, userId, sessionId);
  }

  @Post(':id/violations')
  @UseGuards(JwtAuthGuard)
  async recordViolation(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body('sessionId') sessionId: string,
    @Body('type') type: string,
    @Body('metadata') metadata?: any,
  ) {
    return this.contestsService.recordViolation(id, userId, sessionId, type, metadata);
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Get contest details' })
  async getContest(@Param('slug') slug: string) {
    return this.contestsService.getContest(slug);
  }

  @Post(':id/register')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Register for a contest' })
  async register(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body('password') password?: string,
  ) {
    return this.contestsService.register(id, userId, password);
  }
}
