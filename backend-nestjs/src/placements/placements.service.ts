import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlacementFileStore } from './placement-file-store';
import { randomUUID } from 'node:crypto';
import { ADMIN_ROLES } from '../common/guards/admin.guard';
import {
  Placement,
  PlacementDocument,
  DocumentCategory,
} from './placement.entity';
import { SavePlacementDto } from './dto/save-placement.dto';

export interface PlacementActor {
  id: string;
  role?: string;
  isAdmin?: boolean;
}
export const PDF_LIMIT = 10 * 1024 * 1024;
export function validatePlacementPdfs(files: Express.Multer.File[]) {
  if (!files.length || files.length > 10)
    throw new BadRequestException('Choose between 1 and 10 PDF files.');
  for (const file of files) {
    if (
      file.mimetype !== 'application/pdf' ||
      !file.buffer?.subarray(0, 5).equals(Buffer.from('%PDF-'))
    ) {
      throw new BadRequestException('Only valid PDF files are accepted.');
    }
    if (file.buffer.length > PDF_LIMIT)
      throw new BadRequestException('Each PDF must be 10 MB or smaller.');
  }
}
export function validatePlacementLogo(value: string | null | undefined) {
  if (value == null) return;
  const match =
    /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match)
    throw new BadRequestException('Choose a PNG, JPEG, or WebP logo.');
  const bytes = Buffer.from(match[2], 'base64');
  const valid =
    match[1] === 'png'
      ? bytes
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : match[1] === 'jpeg'
        ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        : bytes.subarray(0, 4).toString() === 'RIFF' &&
          bytes.subarray(8, 12).toString() === 'WEBP';
  if (!valid || bytes.length > 128 * 1024)
    throw new BadRequestException(
      'Logo must be a valid image, 128 KB or smaller after resizing.',
    );
}
@Injectable()
export class PlacementsService {
  constructor(
    @InjectRepository(Placement) private readonly repo: Repository<Placement>,
  ) {}
  private readonly fileStore = new PlacementFileStore();
  private isAdmin(actor: PlacementActor) {
    return Boolean(actor.isAdmin || ADMIN_ROLES.includes(actor.role || ''));
  }
  serialize(item: Placement) {
    // Storage paths and creator identities never leave the service.
    const { createdById: _creator, documents, ...fields } = item;
    return {
      ...fields,
      documents: documents.map(({ key: _key, ...doc }) => doc),
    };
  }
  async list(manage = false) {
    const list = await this.repo.find({
      where: manage ? {} : { status: 'published' },
      order: { createdAt: 'DESC' },
    });
    return { placements: list.map((item) => this.serialize(item)) };
  }
  async get(id: string, actor: PlacementActor) {
    const item = await this.repo.findOneBy({ id });
    if (!item || (item.status !== 'published' && !this.isAdmin(actor)))
      throw new NotFoundException('Placement not found.');
    return item;
  }
  async save(dto: SavePlacementDto, actor: PlacementActor, id?: string) {
    validatePlacementLogo(dto.logoImage);
    // Keep JSON document changes atomic with metadata updates.
    return this.repo.manager.transaction(async (manager) => {
      const repo = manager.getRepository(Placement);
      const item = id
        ? await repo.findOne({
            where: { id },
            lock: { mode: 'pessimistic_write' },
          })
        : repo.create({ documents: [], createdById: actor.id });
      if (!item) throw new NotFoundException('Placement not found.');
      if (dto.logoImage !== undefined) item.logoImage = dto.logoImage;
      Object.assign(item, {
        companyName: dto.companyName,
        companyProfile: dto.companyProfile,
        jobTitle: dto.jobTitle || '',
        package: dto.package,
        visitDate: dto.visitDate || null,
        status: dto.status,
        learningResources: dto.learningResources,
      });
      return { placement: this.serialize(await repo.save(item)) };
    });
  }
  async upload(
    id: string,
    category: DocumentCategory,
    files: Express.Multer.File[],
  ) {
    validatePlacementPdfs(files);
    if (
      !['job-description', 'company-profile', 'learning-resource'].includes(
        category,
      )
    )
      throw new BadRequestException('Choose a valid document category.');
    const stored: PlacementDocument[] = [];
    try {
      const result = await this.repo.manager.transaction(async (manager) => {
        const repo = manager.getRepository(Placement);
        const item = await repo.findOne({
          where: { id },
          lock: { mode: 'pessimistic_write' },
        });
        if (!item) throw new NotFoundException('Placement not found.');
        if (item.documents.length + files.length > 30)
          throw new BadRequestException(
            'A placement can contain up to 30 PDFs.',
          );
        for (const file of files) {
          const doc: PlacementDocument = {
            id: randomUUID(),
            key: `${randomUUID()}.pdf`,
            name: file.originalname.replace(/[\p{Cc}/\\]/gu, '_').slice(0, 180),
            size: file.buffer.length,
            category,
          };
          await this.fileStore.write(doc.key, file.buffer);
          stored.push(doc);
        }
        item.documents = [...item.documents, ...stored];
        return { placement: this.serialize(await repo.save(item)) };
      });
      return result;
    } catch (error) {
      await Promise.all(
        stored.map((doc) =>
          this.fileStore.remove(doc.key).catch(() => undefined),
        ),
      );
      throw error;
    }
  }
  async removeDocument(id: string, docId: string) {
    let removed: PlacementDocument | undefined;
    const result = await this.repo.manager.transaction(async (manager) => {
      const repo = manager.getRepository(Placement);
      const item = await repo.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!item) throw new NotFoundException('Placement not found.');
      removed = item.documents.find((doc) => doc.id === docId);
      if (!removed) throw new NotFoundException('Document not found.');
      item.documents = item.documents.filter((doc) => doc.id !== docId);
      return { placement: this.serialize(await repo.save(item)) };
    });
    if (removed && /^[a-f0-9-]+\.pdf$/.test(removed.key))
      await this.fileStore.remove(removed.key).catch(() => undefined);
    return result;
  }
  async download(id: string, docId: string, actor: PlacementActor) {
    const item = await this.get(id, actor);
    const doc = item.documents.find((file) => file.id === docId);
    if (!doc || !/^[a-f0-9-]+\.pdf$/.test(doc.key))
      throw new NotFoundException('Document not found.');
    try {
      return {
        name: doc.name,
        content: await this.fileStore.read(doc.key),
      };
    } catch {
      throw new NotFoundException(
        'This document is unavailable. Please contact the placement team.',
      );
    }
  }
}
