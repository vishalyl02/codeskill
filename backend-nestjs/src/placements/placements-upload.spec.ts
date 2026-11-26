import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PlacementsController } from './placements.controller';
import { PlacementsService, validatePlacementPdfs } from './placements.service';

describe('placement PDF multipart size limit', () => {
  let app: INestApplication;
  const upload = jest.fn(
    (_id: string, _category: string, files: Express.Multer.File[]) => {
      validatePlacementPdfs(files);
      return { count: files.length };
    },
  );

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PlacementsController],
      providers: [{ provide: PlacementsService, useValue: { upload } }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: import('@nestjs/common').ExecutionContext) => {
          context.switchToHttp().getRequest<{ user: { role: string } }>().user =
            { role: 'super_admin' };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');
  });

  afterAll(async () => {
    await app?.close();
  });

  const path =
    '/api/placements/12345678-1234-4234-8234-123456789abc/documents?category=learning-resource';

  function pdf(bytes: number) {
    const file = Buffer.alloc(bytes);
    file.write('%PDF-1.4');
    return file;
  }

  it('passes a PDF of exactly 10 MiB through multipart parsing and validation', async () => {
    await request(app.getHttpServer())
      .post(path)
      .attach('files', pdf(10 * 1024 * 1024), 'at-limit.pdf')
      .expect(201, { count: 1 });
  });

  it('rejects a PDF one byte over the limit before calling the service', async () => {
    upload.mockClear();
    await request(app.getHttpServer())
      .post(path)
      .attach('files', pdf(10 * 1024 * 1024 + 1), 'over-limit.pdf')
      .expect(413);
    expect(upload).not.toHaveBeenCalled();
  });
});
