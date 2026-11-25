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
export const DEFAULT_TAG = `lockdown-v${DEFAULT_VERSION}`;
export const CANONICAL_RELEASES_PAGE = `https://github.com/${CANONICAL_REPO}/releases`;
export const CANONICAL_LATEST_RELEASE = `https://github.com/${CANONICAL_REPO}/releases/latest`;

export interface PlatformAsset {
  filename: string;
  contentType: string;
  format: string;
  installerType: string;
}

export const PLATFORM_MAP: Record<string, PlatformAsset> = {
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

export function getPlatformCandidates(
  platform: string,
  version: string = DEFAULT_VERSION,
  formatParam?: string,
): string[] {
  const cleanVersion = version.replace(/^v/, '');
  switch (platform) {
    case 'windows':
      return [
        'CodeSkill-LockDown-Setup.exe',
        `CodeSkill-LockDown-${cleanVersion}-Setup.exe`,
        `CodeSkill.LockDown_${cleanVersion}_x64-setup.exe`,
        'codeskill-lockdown-setup.exe',
        'CodeSkill-LockDown.exe',
      ];
    case 'macos':
      return [
        `CodeSkill.LockDown_${cleanVersion}_aarch64.dmg`,
        `CodeSkill.LockDown_${cleanVersion}_x64.dmg`,
        'codeskill-lockdown.dmg',
        'CodeSkill-LockDown.dmg',
        `CodeSkill-LockDown-${cleanVersion}.dmg`,
        `CodeSkill.LockDown_${cleanVersion}.dmg`,
      ];
    case 'linux':
      if (formatParam?.toLowerCase() === 'appimage') {
        return [
          `CodeSkill.LockDown_${cleanVersion}_amd64.AppImage`,
          'codeskill-lockdown.AppImage',
          'CodeSkill-LockDown.AppImage',
          `CodeSkill-LockDown-${cleanVersion}.AppImage`,
          `CodeSkill.LockDown_${cleanVersion}_amd64.deb`,
          'codeskill-lockdown.deb',
        ];
      }
      return [
        `CodeSkill.LockDown_${cleanVersion}_amd64.deb`,
        'codeskill-lockdown.deb',
        'CodeSkill-LockDown.deb',
        `CodeSkill-LockDown-${cleanVersion}.deb`,
        `CodeSkill.LockDown_${cleanVersion}_amd64.AppImage`,
        'codeskill-lockdown.AppImage',
      ];
    default:
      return ['CodeSkill-LockDown-Setup.exe'];
  }
}

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
  async downloadLockdown(
    @Query('platform') queryPlatform: string | undefined,
    @Query('redirect') redirectQuery: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
    @Query('version') queryVersion?: string,
    @Query('tag') queryTag?: string,
    @Query('format') queryFormat?: string,
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

    const version = queryVersion || DEFAULT_VERSION;
    const cleanVersion = version.replace(/^v/, '');
    const tag = queryTag || `lockdown-v${cleanVersion}`;
    const candidates = getPlatformCandidates(platform, cleanVersion, queryFormat);
    const preferredFilename = candidates[0] || asset.filename;

    const cdnBase =
      process.env.LOCKDOWN_CDN_URL || process.env.NEXT_PUBLIC_LOCKDOWN_CDN_URL;
    const githubToken =
      process.env.LOCKDOWN_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
    const directUrl = cdnBase
      ? `${cdnBase.replace(/\/+$/, '')}/${asset.filename}`
      : `https://github.com/${CANONICAL_REPO}/releases/download/${tag}/${preferredFilename}`;
    const fallbackUrl = CANONICAL_LATEST_RELEASE;
    const releasesPage = CANONICAL_RELEASES_PAGE;

    res.set({
      'Content-Type': asset.contentType,
      'Content-Disposition': `attachment; filename="${preferredFilename}"`,
      'Cache-Control': 'public, max-age=300',
      'X-CodeSkill-Installer-Version': cleanVersion,
      'X-CodeSkill-Installer-Tag': tag,
      'X-CodeSkill-Installer-Format': asset.format,
      'X-CodeSkill-Installer-Type': asset.installerType,
      'X-CodeSkill-Fallback-Url': fallbackUrl,
    });

    if (
      redirectQuery === 'false' ||
      queryFormat === 'json' ||
      (req.headers && req.headers.accept?.includes('application/json'))
    ) {
      return res.status(200).json({
        success: true,
        platform,
        version: cleanVersion,
        tag,
        filename: preferredFilename,
        canonicalFilename: asset.filename,
        format: asset.format,
        installerType: asset.installerType,
        configured: Boolean(cdnBase || githubToken),
        url: directUrl,
        candidates,
        fallbackUrl,
        releasesPage,
      });
    }

    if (cdnBase) {
      return res.redirect(302, directUrl);
    }

    // Authenticated GitHub Release Asset Proxy for private repositories
    if (githubToken) {
      try {
        const releaseApiUrl = `https://api.github.com/repos/${CANONICAL_REPO}/releases/tags/${tag}`;
        const releaseRes = await fetch(releaseApiUrl, {
          headers: {
            Authorization: `Bearer ${githubToken}`,
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'CodeSkill-Installer-Downloader',
          },
        });

        if (releaseRes.ok) {
          const releaseData = (await releaseRes.json()) as {
            assets?: Array<{ id: number; name: string }>;
          };
          const assets = releaseData.assets || [];

          let matchedAsset = null;
          for (const candidate of candidates) {
            const found = assets.find((a) => a.name === candidate);
            if (found) {
              matchedAsset = found;
              break;
            }
          }

          if (matchedAsset) {
            const assetDownloadUrl = `https://api.github.com/repos/${CANONICAL_REPO}/releases/assets/${matchedAsset.id}`;
            const assetRes = await fetch(assetDownloadUrl, {
              headers: {
                Authorization: `Bearer ${githubToken}`,
                Accept: 'application/octet-stream',
                'User-Agent': 'CodeSkill-Installer-Downloader',
              },
              redirect: 'manual',
            });

            const signedS3Url = assetRes.headers.get('location');
            if (signedS3Url) {
              res.set('X-CodeSkill-Asset-Source', 'github-signed-s3');
              return res.redirect(302, signedS3Url);
            }
          }
        }
      } catch (proxyErr) {
        // Fall through to canonical redirect
      }
    }

    return res.redirect(302, directUrl);
  }

  @Get('download/:platform')
  @HttpCode(302)
  async downloadByPlatform(
    @Param('platform') platformParam: string,
    @Req() req: Request,
    @Res() res: Response,
    @Query('version') queryVersion?: string,
    @Query('tag') queryTag?: string,
    @Query('format') queryFormat?: string,
  ) {
    return this.downloadLockdown(
      platformParam,
      undefined,
      req,
      res,
      queryVersion,
      queryTag,
      queryFormat,
    );
  }

  @Get('manifest')
  getManifest() {
    const cdnBase = (
      process.env.LOCKDOWN_CDN_URL ||
      process.env.NEXT_PUBLIC_LOCKDOWN_CDN_URL ||
      ''
    ).replace(/\/+$/, '');
    const releaseBase = `https://github.com/${CANONICAL_REPO}/releases/latest`;
    const winCandidates = getPlatformCandidates('windows', DEFAULT_VERSION);
    const macCandidates = getPlatformCandidates('macos', DEFAULT_VERSION);
    const linuxCandidates = getPlatformCandidates('linux', DEFAULT_VERSION);

    return {
      success: true,
      productName: 'CodeSkill LockDown',
      version: DEFAULT_VERSION,
      tag: DEFAULT_TAG,
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
          filename: winCandidates[0] || PLATFORM_MAP.windows.filename,
          candidates: winCandidates,
          downloadUrl: `/api/exam-security/lockdown/download?platform=windows&version=${DEFAULT_VERSION}`,
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
          filename: macCandidates[0] || PLATFORM_MAP.macos.filename,
          candidates: macCandidates,
          downloadUrl: `/api/exam-security/lockdown/download?platform=macos&version=${DEFAULT_VERSION}`,
          cdnUrl: cdnBase ? `${cdnBase}/${PLATFORM_MAP.macos.filename}` : null,
          fallbackUrl: `${releaseBase}/download/${PLATFORM_MAP.macos.filename}`,
          releasesPage: releaseBase,
        },
        linux: {
          os: 'linux',
          format: 'deb',
          installerType: 'deb',
          filename: linuxCandidates[0] || PLATFORM_MAP.linux.filename,
          candidates: linuxCandidates,
          downloadUrl: `/api/exam-security/lockdown/download?platform=linux&version=${DEFAULT_VERSION}`,
          cdnUrl: cdnBase ? `${cdnBase}/${PLATFORM_MAP.linux.filename}` : null,
          fallbackUrl: `${releaseBase}/download/${PLATFORM_MAP.linux.filename}`,
          releasesPage: releaseBase,
        },
      },
    };
  }
}
