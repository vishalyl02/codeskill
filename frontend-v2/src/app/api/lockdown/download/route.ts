import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export const CANONICAL_REPO = 'sazamansari/codeskill';
export const CANONICAL_RELEASES_PAGE = `https://github.com/${CANONICAL_REPO}/releases`;
export const CANONICAL_LATEST_RELEASE = `https://github.com/${CANONICAL_REPO}/releases/latest`;
export const DEFAULT_VERSION = '1.0.0';
export const DEFAULT_TAG = `lockdown-v${DEFAULT_VERSION}`;

export interface PlatformAssetConfig {
  canonicalFilename: string;
  contentType: string;
  format: string;
  installerType: string;
}

export const PLATFORM_CONFIG: Record<string, PlatformAssetConfig> = {
  windows: {
    canonicalFilename: 'CodeSkill-LockDown-Setup.exe',
    contentType: 'application/vnd.microsoft.portable-executable',
    format: 'exe',
    installerType: 'nsis',
  },
  macos: {
    canonicalFilename: 'codeskill-lockdown.dmg',
    contentType: 'application/x-apple-diskimage',
    format: 'dmg',
    installerType: 'dmg',
  },
  linux: {
    canonicalFilename: 'codeskill-lockdown.deb',
    contentType: 'application/vnd.debian.binary-package',
    format: 'deb',
    installerType: 'deb',
  },
};

export function getPlatformCandidates(
  platform: string,
  version: string = DEFAULT_VERSION,
  formatParam?: string | null,
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

export function detectPlatform(req: NextRequest, queryPlatform?: string | null): string {
  if (queryPlatform) {
    const p = queryPlatform.toLowerCase();
    if (p.includes('win') || p.includes('exe')) return 'windows';
    if (p.includes('mac') || p.includes('darwin') || p.includes('dmg')) return 'macos';
    if (p.includes('linux') || p.includes('deb') || p.includes('appimage')) return 'linux';
  }

  const userAgent = req.headers.get('user-agent') || '';
  if (/windows|win32|win64/i.test(userAgent)) return 'windows';
  if (/macintosh|mac os x/i.test(userAgent)) return 'macos';
  if (/linux/i.test(userAgent)) return 'linux';

  return 'windows';
}

function isRealBinary(buffer: Buffer, platform: string): boolean {
  if (!buffer || buffer.length < 10000) {
    return false;
  }
  if (platform === 'windows') {
    return buffer[0] === 0x4d && buffer[1] === 0x5a;
  }
  if (platform === 'macos') {
    return buffer.length > 500000;
  }
  if (platform === 'linux') {
    return (
      (buffer[0] === 0x21 && buffer[1] === 0x3c) ||
      (buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46)
    );
  }
  return true;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const requestedPlatform = searchParams.get('platform');
  const direct = searchParams.get('direct') === 'true';
  const format = searchParams.get('format');
  const versionParam = searchParams.get('version') || DEFAULT_VERSION;
  const cleanVersion = versionParam.replace(/^v/, '');
  const tagParam = searchParams.get('tag') || `lockdown-v${cleanVersion}`;

  const platform = detectPlatform(req, requestedPlatform);
  const assetConfig = PLATFORM_CONFIG[platform] || PLATFORM_CONFIG.windows;
  const candidates = getPlatformCandidates(platform, cleanVersion, format);
  const preferredFilename = candidates[0] || assetConfig.canonicalFilename;

  const cdnBase = process.env.NEXT_PUBLIC_LOCKDOWN_CDN_URL || process.env.LOCKDOWN_CDN_URL;
  const directUrl = cdnBase
    ? `${cdnBase.replace(/\/+$/, '')}/${assetConfig.canonicalFilename}`
    : `https://github.com/${CANONICAL_REPO}/releases/download/${tagParam}/${preferredFilename}`;

  // Optional JSON metadata query
  const acceptsJson = req.headers.get('accept')?.includes('application/json');
  if (format === 'json' || acceptsJson) {
    return NextResponse.json({
      success: true,
      platform,
      version: cleanVersion,
      tag: tagParam,
      filename: preferredFilename,
      canonicalFilename: assetConfig.canonicalFilename,
      format: assetConfig.format,
      installerType: assetConfig.installerType,
      url: directUrl,
      candidates,
      fallbackUrl: `${CANONICAL_LATEST_RELEASE}/download/${preferredFilename}`,
      releasesPage: CANONICAL_RELEASES_PAGE,
    });
  }

  // 1. Check if CDN base is configured
  if (cdnBase && !direct) {
    const cleanCdn = cdnBase.replace(/\/+$/, '');
    const cdnUrl = `${cleanCdn}/${assetConfig.canonicalFilename}`;
    return NextResponse.redirect(cdnUrl, {
      status: 302,
      headers: {
        'Content-Type': assetConfig.contentType,
        'Content-Disposition': `attachment; filename="${assetConfig.canonicalFilename}"`,
        'X-CodeSkill-Installer-Version': cleanVersion,
        'X-CodeSkill-Installer-Tag': tagParam,
        'X-CodeSkill-Installer-Format': assetConfig.format,
        'X-CodeSkill-Installer-Type': assetConfig.installerType,
        'X-CodeSkill-Fallback-Url': CANONICAL_RELEASES_PAGE,
      },
    });
  }

  // 2. Check local static file in public/downloads (only serve if real compiled binary)
  const publicDownloads = path.join(process.cwd(), 'public', 'downloads');
  let candidatePath: string | null = null;
  let resolvedFilename = assetConfig.canonicalFilename;

  for (const candidate of candidates) {
    const p = path.join(publicDownloads, candidate);
    if (fs.existsSync(p)) {
      candidatePath = p;
      resolvedFilename = candidate;
      break;
    }
  }

  if (candidatePath && fs.existsSync(candidatePath)) {
    try {
      const fileBuffer = fs.readFileSync(candidatePath);
      if (isRealBinary(fileBuffer, platform)) {
        return new NextResponse(fileBuffer, {
          status: 200,
          headers: {
            'Content-Type': assetConfig.contentType,
            'Content-Disposition': `attachment; filename="${resolvedFilename}"`,
            'Content-Length': fileBuffer.byteLength.toString(),
            'Cache-Control': 'public, max-age=300, s-maxage=3600',
            'X-CodeSkill-Installer-Version': cleanVersion,
            'X-CodeSkill-Installer-Tag': tagParam,
            'X-CodeSkill-Installer-Format': assetConfig.format,
            'X-CodeSkill-Installer-Type': assetConfig.installerType,
          },
        });
      }
    } catch {
      // Fall through to canonical GitHub Releases redirect
    }
  }

  // 3. Fallback to canonical GitHub Releases asset for this version tag
  const githubReleaseUrl = `https://github.com/${CANONICAL_REPO}/releases/download/${tagParam}/${preferredFilename}`;
  return NextResponse.redirect(githubReleaseUrl, {
    status: 302,
    headers: {
      'Content-Type': assetConfig.contentType,
      'Content-Disposition': `attachment; filename="${preferredFilename}"`,
      'X-CodeSkill-Installer-Version': cleanVersion,
      'X-CodeSkill-Installer-Tag': tagParam,
      'X-CodeSkill-Installer-Format': assetConfig.format,
      'X-CodeSkill-Installer-Type': assetConfig.installerType,
      'X-CodeSkill-Fallback-Url': CANONICAL_RELEASES_PAGE,
    },
  });
}
