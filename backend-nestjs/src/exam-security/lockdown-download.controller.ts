import {
  Controller,
  Get,
  Query,
  Param,
  Res,
  Req,
  HttpCode,
} from '@nestjs/common';
import type { Request, Response } from 'express';

export const CANONICAL_REPO = 'sazamansari/codeskill';
export const DEFAULT_VERSION = '1.0.0';
export const CANONICAL_RELEASES_PAGE = `https://github.com/${CANONICAL_REPO}/releases`;
export const CANONICAL_LATEST_RELEASE = `https://github.com/${CANONICAL_REPO}/releases/latest`;

interface PlatformAsset {
  filename: string;
  contentType: string;
  format: string;
  installerType: string;
}

const PLATFORM_MAP: Record<string, PlatformAsset> = {
  windows: {
    filename: 'CodeSkill-LockDown-Setup.exe',
    contentType: 'application/vnd.microsoft.portable-executable',
    format: 'exe',
    installerType: 'nsis',
  },
  macos: {
    filename: 'codeskill-lockdown.dmg',
    contentType: 'application/x-apple-diskimage',
    format: 'dmg',
    installerType: 'dmg',
  },
  linux: {
    filename: 'codeskill-lockdown.deb',
    contentType: 'application/vnd.debian.binary-package',
    format: 'deb',
    installerType: 'deb',
  },
};

@Controller(['exam-security/lockdown', 'lockdown'])
export class LockdownDownloadController {
  private detectPlatform(platform?: string, userAgent = ''): string {
    if (platform) {
      const p = platform.toLowerCase();
      if (p.includes('win') || p.includes('exe')) return 'windows';
      if (p.includes('mac') || p.includes('darwin') || p.includes('dmg')) {
        return 'macos';
      }
      if (p.includes('linux') || p.includes('deb') || p.includes('appimage')) {
        return 'linux';
      }
    }

    if (/windows|win32|win64/i.test(userAgent)) return 'windows';
    if (/macintosh|mac os x/i.test(userAgent)) return 'macos';
    if (/linux/i.test(userAgent)) return 'linux';

    return 'windows';
  }

  @Get('download')
  @HttpCode(302)
  downloadLockdown(
    @Query('platform') queryPlatform: string | undefined,
    @Query('redirect') redirectQuery: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const rawUserAgent = req?.headers?.['user-agent'];
    const userAgentStr: string =
      typeof rawUserAgent === 'string'
        ? rawUserAgent
        : Array.isArray(rawUserAgent)
          ? (rawUserAgent[0] ?? '')
          : '';
    const platform = this.detectPlatform(queryPlatform, userAgentStr);
    const asset = PLATFORM_MAP[platform] || PLATFORM_MAP.windows;

    const cdnBase =
      process.env.LOCKDOWN_CDN_URL || process.env.NEXT_PUBLIC_LOCKDOWN_CDN_URL;
    const directUrl = cdnBase
      ? `${cdnBase.replace(/\/+$/, '')}/${asset.filename}`
      : `https://github.com/${CANONICAL_REPO}/releases/latest/download/${asset.filename}`;
    const fallbackUrl = CANONICAL_LATEST_RELEASE;
    const releasesPage = CANONICAL_RELEASES_PAGE;

    res.set({
      'Content-Type': asset.contentType,
      'Content-Disposition': `attachment; filename="${asset.filename}"`,
      'Cache-Control': 'public, max-age=300',
      'X-CodeSkill-Installer-Format': asset.format,
      'X-CodeSkill-Installer-Type': asset.installerType,
      'X-CodeSkill-Fallback-Url': fallbackUrl,
    });

    if (
      redirectQuery === 'false' ||
      (req.headers && req.headers.accept?.includes('application/json'))
    ) {
      return res.status(200).json({
        success: true,
        platform,
        filename: asset.filename,
        format: asset.format,
        installerType: asset.installerType,
        url: directUrl,
        fallbackUrl,
        releasesPage,
      });
    }

    return res.redirect(302, directUrl);
  }

  @Get('download/:platform')
  @HttpCode(302)
  downloadByPlatform(
    @Param('platform') platformParam: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.downloadLockdown(platformParam, undefined, req, res);
  }

  @Get('manifest')
  getManifest() {
    const cdnBase = (
      process.env.LOCKDOWN_CDN_URL ||
      process.env.NEXT_PUBLIC_LOCKDOWN_CDN_URL ||
      ''
    ).replace(/\/+$/, '');
    const releaseBase = `https://github.com/${CANONICAL_REPO}/releases/latest`;

    return {
      success: true,
      productName: 'CodeSkill LockDown',
      version: DEFAULT_VERSION,
      bundleTargets: {
        windows: 'nsis',
        macos: 'dmg',
        linux: 'deb',
      },
      platforms: {
        windows: {
          os: 'windows',
          format: 'exe',
          installerType: 'nsis',
          filename: PLATFORM_MAP.windows.filename,
          downloadUrl: '/api/exam-security/lockdown/download?platform=windows',
          cdnUrl: cdnBase
            ? `${cdnBase}/${PLATFORM_MAP.windows.filename}`
            : null,
          fallbackUrl: `${releaseBase}/download/${PLATFORM_MAP.windows.filename}`,
          releasesPage: releaseBase,
        },
        macos: {
          os: 'macos',
          format: 'dmg',
          installerType: 'dmg',
          filename: PLATFORM_MAP.macos.filename,
          downloadUrl: '/api/exam-security/lockdown/download?platform=macos',
          cdnUrl: cdnBase ? `${cdnBase}/${PLATFORM_MAP.macos.filename}` : null,
          fallbackUrl: `${releaseBase}/download/${PLATFORM_MAP.macos.filename}`,
          releasesPage: releaseBase,
        },
        linux: {
          os: 'linux',
          format: 'deb',
          installerType: 'deb',
          filename: PLATFORM_MAP.linux.filename,
          downloadUrl: '/api/exam-security/lockdown/download?platform=linux',
          cdnUrl: cdnBase ? `${cdnBase}/${PLATFORM_MAP.linux.filename}` : null,
          fallbackUrl: `${releaseBase}/download/${PLATFORM_MAP.linux.filename}`,
          releasesPage: releaseBase,
        },
      },
    };
  }
}
