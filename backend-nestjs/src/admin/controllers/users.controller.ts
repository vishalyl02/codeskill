import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Query,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AdminService } from '../admin.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UpdateUserRoleDto } from '../dto/update-user-role.dto';
import { CreateAdminUserDto } from '../dto/create-admin-user.dto';
import { CreateFacultyAssignmentDto } from '../dto/create-faculty-assignment.dto';

@ApiTags('Admin - Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly adminService: AdminService) {}

  @Post()
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: 'Create a new admin user (super_admin only)' })
  async createAdmin(
    @Body() body: CreateAdminUserDto,
    @CurrentUser() currentUser: any,
  ) {
    const user = await this.adminService.createAdminUser(body, currentUser);
    return { success: true, user };
  }

  @Get()
  @ApiOperation({ summary: 'List all users with pagination and search' })
  async getUsers(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('search') search: string,
    @Query('adminsOnly') adminsOnly: string,
  ) {
    return this.adminService.getUsers(
      parseInt(page, 10) || 1,
      parseInt(limit, 10) || 50,
      search,
      adminsOnly === 'true',
    );
  }

  @Put(':id/role')
  @Patch(':id/role')
  @ApiOperation({ summary: 'Update user role with strict authorization checks' })
  async updateUserRole(
    @Param('id') id: string,
    @Body() body: UpdateUserRoleDto,
    @CurrentUser() currentUser: any,
  ) {
    const user = await this.adminService.updateUserRole(id, body, currentUser);
    return { success: true, user };
  }

  @Get(':id/report')
  @ApiOperation({ summary: 'Get candidate report' })
  async getReport(@Param('id') id: string) {
    return this.adminService.getReport(id);
  }

  @Put(':id/promote')
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: 'Promote user to admin (super_admin only)' })
  async promoteUser(
    @Param('id') id: string,
    @CurrentUser() currentUser: any,
  ) {
    return this.adminService.promoteUser(id, currentUser);
  }

  @Put(':id/demote')
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: 'Demote user from admin (super_admin only)' })
  async demoteUser(
    @Param('id') id: string,
    @CurrentUser() currentUser: any,
  ) {
    return this.adminService.demoteUser(id, currentUser);
  }

  @Post(':id/faculty-assignments')
  @ApiOperation({ summary: 'Assign faculty to a cohort batch and course' })
  async createFacultyAssignment(
    @Param('id') id: string,
    @Body() body: CreateFacultyAssignmentDto,
    @CurrentUser() currentUser: any,
  ) {
    return this.adminService.createFacultyAssignment(id, body, currentUser);
  }

  @Get(':id/faculty-assignments')
  @ApiOperation({ summary: 'List all cohort assignments for a faculty user' })
  async getFacultyAssignments(@Param('id') id: string) {
    return this.adminService.getFacultyAssignments(id);
  }

  @Delete(':id/faculty-assignments/:assignmentId')
  @ApiOperation({ summary: 'Remove a faculty cohort assignment' })
  async deleteUserFacultyAssignment(
    @Param('assignmentId') assignmentId: string,
    @CurrentUser() currentUser: any,
  ) {
    return this.adminService.deleteFacultyAssignment(assignmentId, currentUser);
  }
}
