import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PlacementsService, PDF_LIMIT } from './placements.service';
import type { PlacementActor } from './placements.service';
import { SavePlacementDto } from './dto/save-placement.dto';
import type { DocumentCategory } from './placement.entity';

@Controller('placements')
@UseGuards(JwtAuthGuard)
export class PlacementsController {
  constructor(private readonly service: PlacementsService) {}
  @Get() list() {
    return this.service.list();
  }
  @Get('manage') @UseGuards(AdminGuard) manage() {
    return this.service.list(true);
  }
  @Post() @UseGuards(AdminGuard) create(
    @Body() dto: SavePlacementDto,
    @CurrentUser() actor: PlacementActor,
  ) {
    return this.service.save(dto, actor);
  }
  @Put(':id') @UseGuards(AdminGuard) update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SavePlacementDto,
    @CurrentUser() actor: PlacementActor,
  ) {
    return this.service.save(dto, actor, id);
  }
  @Post(':id/documents')
  @UseGuards(AdminGuard)
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: memoryStorage(),
      // Busboy reports a limit event at equality. Allow exactly PDF_LIMIT bytes.
      limits: { fileSize: PDF_LIMIT + 1, files: 10 },
      fileFilter: (_req, file, done) => {
        if (file.mimetype !== 'application/pdf')
          return done(
            new BadRequestException('Only PDF files are accepted.'),
            false,
          );
        done(null, true);
      },
    }),
  )
  upload(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('category') category: DocumentCategory,
    @UploadedFiles() files: Express.Multer.File[] = [],
  ) {
    return this.service.upload(id, category, files);
  }
  @Delete(':id/documents/:docId')
  @UseGuards(AdminGuard)
  removeDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('docId', ParseUUIDPipe) docId: string,
  ) {
    return this.service.removeDocument(id, docId);
  }
  @Get(':id/documents/:docId')
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('docId', ParseUUIDPipe) docId: string,
    @CurrentUser() actor: PlacementActor,
    @Res() response: Response,
  ) {
    const file = await this.service.download(id, docId, actor);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="placement-document.pdf"; filename*=UTF-8''${encodeURIComponent(file.name).replace(/'/g, '%27')}`,
    );
    response.send(file.content);
  }
}
