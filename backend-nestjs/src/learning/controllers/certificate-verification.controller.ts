import { Controller, Get, Param, Req } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CertificationService } from '../services/certification.service';
import type { Request } from 'express';

@ApiTags('Certificate Verification')
@Controller('certificates')
export class CertificateVerificationController {
  constructor(private readonly certService: CertificationService) {}

  @Get('verify/:credentialId')
  @ApiOperation({ summary: 'Publicly verify a credential without authentication' })
  async verifyCredential(
    @Param('credentialId') credentialId: string,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.headers['x-forwarded-for']?.toString();
    return this.certService.verifyCredential(credentialId, ip);
  }
}
