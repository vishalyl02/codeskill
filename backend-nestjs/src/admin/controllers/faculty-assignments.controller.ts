import {
  Controller,
  Delete,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AdminService } from '../admin.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Admin - Faculty Assignments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/faculty-assignments')
export class AdminFacultyAssignmentsController {
  constructor(private readonly adminService: AdminService) {}

  @Delete(':assignmentId')
  @ApiOperation({ summary: 'Delete a faculty assignment by ID' })
  async deleteAssignment(
    @Param('assignmentId') assignmentId: string,
    @CurrentUser() currentUser: any,
  ) {
    return this.adminService.deleteFacultyAssignment(assignmentId, currentUser);
  }
}
