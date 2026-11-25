jest.mock('@nestjs/typeorm', () => ({ InjectRepository: () => () => {} }));
import 'reflect-metadata';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  PlacementsService,
  validatePlacementPdfs,
  validatePlacementLogo,
  PDF_LIMIT,
} from './placements.service';
import { PlacementsController } from './placements.controller';
import { AdminGuard } from '../common/guards/admin.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SavePlacementDto } from './dto/save-placement.dto';

const pdf = (
  buffer = Buffer.from('%PDF-1.4\nexample'),
  mimetype = 'application/pdf',
) =>
  ({
    buffer,
    mimetype,
    originalname: 'role.pdf',
    size: buffer.length,
  }) as Express.Multer.File;
describe('placement documents and visibility', () => {
  it('accepts multiple PDFs and rejects disguised file content', () => {
    expect(() => validatePlacementPdfs([pdf(), pdf()])).not.toThrow();
    expect(() =>
      validatePlacementPdfs([pdf(Buffer.from('<html>bad</html>'))]),
    ).toThrow(BadRequestException);
    expect(() => validatePlacementPdfs([pdf(undefined, 'image/png')])).toThrow(
      BadRequestException,
    );
  });
  it('enforces file count and size limits', () => {
    expect(() => validatePlacementPdfs([])).toThrow(BadRequestException);
    expect(() =>
      validatePlacementPdfs(Array.from({ length: 11 }, () => pdf())),
    ).toThrow(BadRequestException);
    const large = Buffer.alloc(PDF_LIMIT + 1);
    large.write('%PDF-');
    expect(() => validatePlacementPdfs([pdf(large)])).toThrow(
      BadRequestException,
    );
  });
  it('does not expose draft placements to students', async () => {
    const repo = {
      findOneBy: jest.fn().mockResolvedValue({ status: 'draft' }),
    };
    const service = new PlacementsService(repo as never);
    await expect(
      service.get('id', { id: 'student', role: 'student' }),
    ).rejects.toThrow(NotFoundException);
    await expect(
      service.get('id', { id: 'admin', role: 'admin' }),
    ).resolves.toMatchObject({ status: 'draft' });
  });
  it('filters student lists to published companies', async () => {
    const repo = { find: jest.fn().mockResolvedValue([]) };
    await new PlacementsService(repo as never).list();
    expect(repo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'published' } }),
    );
  });
  it('keeps file storage keys and creator identities private', () => {
    const result = new PlacementsService({} as never).serialize({
      id: 'id',
      createdById: 'admin',
      documents: [
        {
          id: 'doc',
          key: 'private.pdf',
          name: 'JD.pdf',
          size: 20,
          category: 'job-description',
        },
      ],
    } as never);
    expect(result).not.toHaveProperty('createdById');
    expect(result.documents[0]).not.toHaveProperty('key');
  });
  it('requires login for all routes and admin permissions for mutations', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, PlacementsController),
    ).toContain(JwtAuthGuard);
    for (const name of [
      'manage',
      'create',
      'update',
      'upload',
      'removeDocument',
    ] as const) {
      expect(
        Reflect.getMetadata(
          GUARDS_METADATA,
          PlacementsController.prototype[name],
        ),
      ).toContain(AdminGuard);
    }
    const guard = new AdminGuard();
    expect(() =>
      guard.canActivate({
        switchToHttp: () => ({
          getRequest: () => ({ user: { role: 'student' } }),
        }),
      } as never),
    ).toThrow();
  });
  it('rejects script URLs in preparation links', async () => {
    const dto = plainToInstance(SavePlacementDto, {
      companyName: 'Acme',
      companyProfile: 'Profile',
      package: '8 LPA',
      status: 'published',
      learningResources: [{ title: 'Bad', url: 'javascript:alert(1)' }],
    });
    expect((await validate(dto)).length).toBeGreaterThan(0);
    const valid = plainToInstance(SavePlacementDto, {
      ...dto,
      learningResources: [
        { title: 'Preparation', url: 'https://example.com/prepare' },
      ],
    });
    expect(await validate(valid)).toHaveLength(0);
  });
});

describe('placement PDF storage lifecycle', () => {
  it('stores several PDFs, serves exact bytes, and removes only the selected PDF', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'placements-test-'));
    const original = process.env.PLACEMENTS_UPLOAD_DIR;
    process.env.PLACEMENTS_UPLOAD_DIR = directory;
    try {
      const item = {
        id: 'placement',
        status: 'published',
        documents: [] as any[],
      };
      const repo: any = {
        findOne: jest.fn().mockResolvedValue(item),
        findOneBy: jest.fn().mockResolvedValue(item),
        save: jest.fn(async (p: any) => p),
      };
      repo.manager = {
        transaction: async (fn: any) => fn({ getRepository: () => repo }),
      };
      const service = new PlacementsService(repo);
      const result = await service.upload('placement', 'job-description', [
        pdf(),
        pdf(),
      ]);
      expect(result.placement.documents).toHaveLength(2);
      expect(await readdir(directory)).toHaveLength(2);
      const document = result.placement.documents[0];
      expect(
        (
          await service.download('placement', document.id, {
            id: 'student',
            role: 'student',
          })
        ).content,
      ).toEqual(pdf().buffer);
      await service.removeDocument('placement', document.id);
      expect(item.documents).toHaveLength(1);
      expect(await readdir(directory)).toHaveLength(1);
    } finally {
      await rm(directory, { recursive: true, force: true });
      if (original === undefined) delete process.env.PLACEMENTS_UPLOAD_DIR;
      else process.env.PLACEMENTS_UPLOAD_DIR = original;
    }
  });
  it('cleans new PDF files when the database save fails', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'placements-test-'));
    const original = process.env.PLACEMENTS_UPLOAD_DIR;
    process.env.PLACEMENTS_UPLOAD_DIR = directory;
    try {
      const repo: any = {
        findOne: jest.fn().mockResolvedValue({ documents: [] }),
        save: jest.fn().mockRejectedValue(new Error('Database unavailable')),
      };
      repo.manager = {
        transaction: async (fn: any) => fn({ getRepository: () => repo }),
      };
      await expect(
        new PlacementsService(repo).upload('placement', 'learning-resource', [
          pdf(),
        ]),
      ).rejects.toThrow('Database unavailable');
      expect(await readdir(directory)).toHaveLength(0);
    } finally {
      await rm(directory, { recursive: true, force: true });
      if (original === undefined) delete process.env.PLACEMENTS_UPLOAD_DIR;
      else process.env.PLACEMENTS_UPLOAD_DIR = original;
    }
  });
});

describe('company logo validation', () => {
  it('accepts optional or raster image logos and rejects scripts, spoofed files and oversize images', () => {
    expect(() => validatePlacementLogo(null)).not.toThrow();
    expect(() => validatePlacementLogo(undefined)).not.toThrow();
    expect(() =>
      validatePlacementLogo(
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lsEAAAAASUVORK5CYII=',
      ),
    ).not.toThrow();
    expect(() =>
      validatePlacementLogo('data:image/svg+xml;base64,PHN2Zz4='),
    ).toThrow(BadRequestException);
    expect(() =>
      validatePlacementLogo('data:image/png;base64,bm90IGFuIGltYWdl'),
    ).toThrow(BadRequestException);
    expect(() =>
      validatePlacementLogo(
        'data:image/png;base64,' +
          Buffer.concat([
            Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
            Buffer.alloc(129 * 1024),
          ]).toString('base64'),
      ),
    ).toThrow(BadRequestException);
  });
});
