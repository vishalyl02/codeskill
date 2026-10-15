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
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
  ApiConsumes,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { QuestionsService } from './questions.service';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { QueryQuestionsDto } from './dto/query-questions.dto';
import { CreateQuestionBankDto } from './dto/create-question-bank.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Admin - Question Bank')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/questions')
export class QuestionsController {
  constructor(private readonly questionsService: QuestionsService) {}

  @Get()
  @ApiOperation({
    summary:
      'Get paginated list of assessment questions with topic/difficulty filters',
  })
  async findAll(@Query() query: QueryQuestionsDto) {
    return this.questionsService.findAll(query);
  }

  @Post('import')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Upload and validate spreadsheet (XLSX/CSV) for bulk question import',
  })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async importPreview(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Spreadsheet file is required');
    }
    return this.questionsService.parseAndValidateQuestionsImport(file.buffer);
  }

  @Post('import/auto')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '1-Attempt upload, convert, and push (upsert) questions into bank',
  })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 15 * 1024 * 1024 },
    }),
  )
  async autoImport(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() adminUser: any,
    @Req() req: any,
  ) {
    if (!file) {
      throw new BadRequestException('Spreadsheet/CSV file is required');
    }
    const ip = req.ip || req.connection?.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';
    return this.questionsService.autoImportQuestions(
      file.buffer,
      adminUser,
      ip,
      userAgent,
    );
  }

  @Post('import/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Commit validated assessment questions into question bank',
  })
  async confirmImport(
    @Body('validRows') validRows: any[],
    @CurrentUser() adminUser: any,
    @Req() req: any,
  ) {
    const ip = req.ip || req.connection?.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';
    return this.questionsService.confirmQuestionsImport(
      validRows,
      adminUser,
      ip,
      userAgent,
    );
  }

  @Get('topics')
  @ApiOperation({
    summary: 'Get aggregated topic distribution and difficulty breakdowns',
  })
  async getTopics(@Query('topic') topic?: string) {
    const topics = await this.questionsService.getTopicsDistribution(topic);
    return { success: true, topics, data: topics };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get single question details (Admin full view)' })
  @ApiParam({ name: 'id', description: 'Question ID' })
  async findById(@Param('id') id: string) {
    return this.questionsService.findById(id, false);
  }

  @Post()
  @ApiOperation({ summary: 'Manually author a new assessment question' })
  async create(
    @Body() dto: CreateQuestionDto,
    @CurrentUser() adminUser: any,
    @Req() req: any,
  ) {
    const ip = req.ip || req.connection?.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';
    return this.questionsService.create(dto, adminUser, ip, userAgent);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update an existing assessment question' })
  @ApiParam({ name: 'id', description: 'Question ID' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateQuestionDto,
    @CurrentUser() adminUser: any,
    @Req() req: any,
  ) {
    const ip = req.ip || req.connection?.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';
    return this.questionsService.update(id, dto, adminUser, ip, userAgent);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete (archive) an assessment question' })
  @ApiParam({ name: 'id', description: 'Question ID' })
  async delete(
    @Param('id') id: string,
    @CurrentUser() adminUser: any,
    @Req() req: any,
  ) {
    const ip = req.ip || req.connection?.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';
    return this.questionsService.delete(id, adminUser, ip, userAgent);
  }

  @Put(':id/approve')
  @ApiOperation({
    summary: 'Approve a pending or AI-generated question into question bank',
  })
  @ApiParam({ name: 'id', description: 'Question ID' })
  async approve(
    @Param('id') id: string,
    @CurrentUser() adminUser: any,
    @Req() req: any,
  ) {
    const ip = req.ip || req.connection?.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';
    return this.questionsService.review(
      id,
      'approved',
      '',
      adminUser,
      ip,
      userAgent,
    );
  }

  @Put(':id/reject')
  @ApiOperation({
    summary: 'Reject a pending or AI-generated question with reason',
  })
  @ApiParam({ name: 'id', description: 'Question ID' })
  async reject(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @CurrentUser() adminUser: any,
    @Req() req: any,
  ) {
    const ip = req.ip || req.connection?.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';
    return this.questionsService.review(
      id,
      'rejected',
      reason,
      adminUser,
      ip,
      userAgent,
    );
  }
}

@ApiTags('Admin - Question Bank Collections')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/question-banks')
export class QuestionBanksController {
  constructor(private readonly questionsService: QuestionsService) {}

  @Get()
  @ApiOperation({ summary: 'List all question bank collections' })
  async findAll(@Query('topic') topic?: string) {
    const banks = await this.questionsService.findAllBanks(topic);
    return { success: true, banks, data: banks };
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get single question bank with populated questions',
  })
  async findById(@Param('id') id: string) {
    return this.questionsService.findBankById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new question bank collection' })
  async create(
    @Body() dto: CreateQuestionBankDto,
    @CurrentUser() adminUser: any,
  ) {
    return this.questionsService.createBank(dto, adminUser);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a question bank collection' })
  async update(
    @Param('id') id: string,
    @Body() dto: Partial<CreateQuestionBankDto>,
  ) {
    return this.questionsService.updateBank(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a question bank collection' })
  async delete(@Param('id') id: string) {
    return this.questionsService.deleteBank(id);
  }
}
