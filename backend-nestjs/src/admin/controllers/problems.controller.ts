import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { AdminService } from '../admin.service';

@ApiTags('Admin - Problems')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/problems')
export class AdminProblemsController {
  constructor(private readonly adminService: AdminService) { }

  @Get()
  @ApiOperation({ summary: 'List all problems' })
  async getProblems(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('search') search: string,
    @Query('contestEligible') contestEligible: string,
  ) {
    const isContestEligible = contestEligible === 'true';
    const parsedLimit = parseInt(limit, 10);
    const effectiveLimit = parsedLimit > 0 ? parsedLimit : isContestEligible ? 1000 : 20;
    return this.adminService.getProblems(
      parseInt(page, 10) || 1,
      effectiveLimit,
      search,
      isContestEligible,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a problem by ID' })
  async getProblem(@Param('id') id: string) {
    return this.adminService.getProblemById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new problem' })
  async createProblem(@Body() body: any, @Req() req: any) {
    return this.adminService.createProblem(body, req.user?.id || req.user?._id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a problem' })
  async updateProblem(@Param('id') id: string, @Body() body: any) {
    return this.adminService.updateProblem(id, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a problem' })
  async deleteProblem(@Param('id') id: string) {
    return this.adminService.deleteProblem(id);
  }
}
