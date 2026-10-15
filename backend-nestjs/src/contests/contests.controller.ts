import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ContestsService } from './contests.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Contests')
@Controller('contests')
export class ContestsController {
  constructor(private readonly contestsService: ContestsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all public contests' })
  async getContests() {
    return this.contestsService.getContests();
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

  @Post(':id/start')
  @UseGuards(JwtAuthGuard)
  async startAttempt(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.contestsService.startAttempt(id, userId);
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
