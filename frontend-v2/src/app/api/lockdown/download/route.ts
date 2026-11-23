import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const CANONICAL_REPO = 'sazamansari/codeskill';
const CANONICAL_RELEASES_PAGE = `https://github.com/${CANONICAL_REPO}/releases`;
const CANONICAL_LATEST_RELEASE = `https://github.com/${CANONICAL_REPO}/releases/latest`;
const DEFAULT_TAG = 'latest';

interface PlatformAsset {
  filename: string;
  contentType: string;
  format: string;
  installerType: string;
  altFilenames?: string[];
}

const PLATFORM_CONFIG: Record<string, PlatformAsset> = {
  windows: {
    filename: 'CodeSkill-LockDown-Setup.exe',
    contentType: 'application/vnd.microsoft.portable-executable',
    format: 'exe',
    installerType: 'nsis',
    altFilenames: ['codeskill-lockdown-setup.exe'],
  },
  macos: {
    filename: 'codeskill-lockdown.dmg',
    contentType: 'application/x-apple-diskimage',
    format: 'dmg',
    installerType: 'dmg',
    altFilenames: ['CodeSkill-LockDown.dmg'],
  },
  linux: {
    filename: 'codeskill-lockdown.deb',
    contentType: 'application/vnd.debian.binary-package',
    format: 'deb',
    installerType: 'deb',
    altFilenames: ['codeskill-lockdown.AppImage', 'CodeSkill-LockDown.deb'],
  },
};

function detectPlatform(req: NextRequest, queryPlatform?: string | null): string {
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
    // Dev placeholder files are only a few hundred bytes; genuine installers are megabytes.
    return false;
  }
  if (platform === 'windows') {
    // Windows PE binary starts with 'MZ' (0x4D, 0x5A)
    return buffer[0] === 0x4d && buffer[1] === 0x5a;
  }
  if (platform === 'macos') {
    // macOS DMG or zip
    return buffer.length > 500000;
  }
  if (platform === 'linux') {
    // Debian package is ar archive ('!<arch>') or AppImage ELF
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
  const platform = detectPlatform(req, requestedPlatform);
  const assetConfig = PLATFORM_CONFIG[platform] || PLATFORM_CONFIG.windows;

  const cdnBase = process.env.NEXT_PUBLIC_LOCKDOWN_CDN_URL || process.env.LOCKDOWN_CDN_URL;
  const directUrl = cdnBase
    ? `${cdnBase.replace(/\/+$/, '')}/${assetConfig.filename}`
    : `https://github.com/${CANONICAL_REPO}/releases/${DEFAULT_TAG}/download/${assetConfig.filename}`;

  // Optional JSON metadata query
  const acceptsJson = req.headers.get('accept')?.includes('application/json');
  if (format === 'json' || acceptsJson) {
    return NextResponse.json({
      success: true,
      platform,
      filename: assetConfig.filename,
      format: assetConfig.format,
      installerType: assetConfig.installerType,
      url: directUrl,
      fallbackUrl: `${CANONICAL_LATEST_RELEASE}/download/${assetConfig.filename}`,
      releasesPage: CANONICAL_RELEASES_PAGE,
    });
  }

  // 1. Check if CDN base is configured
  if (cdnBase && !direct) {
    const cleanCdn = cdnBase.replace(/\/+$/, '');
    const cdnUrl = `${cleanCdn}/${assetConfig.filename}`;
    return NextResponse.redirect(cdnUrl, {
      status: 302,
      headers: {
        'Content-Type': assetConfig.contentType,
        'Content-Disposition': `attachment; filename="${assetConfig.filename}"`,
        'X-CodeSkill-Installer-Format': assetConfig.format,
        'X-CodeSkill-Installer-Type': assetConfig.installerType,
        'X-CodeSkill-Fallback-Url': CANONICAL_RELEASES_PAGE,
      },
    });
  }

  // 2. Check local static file in public/downloads (only serve if real compiled binary)
  const publicDownloads = path.join(process.cwd(), 'public', 'downloads');
  const primaryPath = path.join(publicDownloads, assetConfig.filename);

  let candidatePath = fs.existsSync(primaryPath) ? primaryPath : null;
  if (!candidatePath && assetConfig.altFilenames) {
    for (const alt of assetConfig.altFilenames) {
      const altPath = path.join(publicDownloads, alt);
      if (fs.existsSync(altPath)) {
        candidatePath = altPath;
        break;
      }
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
            'Content-Disposition': `attachment; filename="${assetConfig.filename}"`,
            'Content-Length': fileBuffer.byteLength.toString(),
            'Cache-Control': 'public, max-age=300, s-maxage=3600',
            'X-CodeSkill-Installer-Format': assetConfig.format,
            'X-CodeSkill-Installer-Type': assetConfig.installerType,
          },
        });
      }
    } catch {
      // Fall through to GitHub Releases redirect
    }
  }

  // 3. Fallback to canonical GitHub Releases asset
  const githubReleaseUrl = `https://github.com/${CANONICAL_REPO}/releases/${DEFAULT_TAG}/download/${assetConfig.filename}`;
  return NextResponse.redirect(githubReleaseUrl, {
    status: 302,
    headers: {
      'Content-Type': assetConfig.contentType,
      'Content-Disposition': `attachment; filename="${assetConfig.filename}"`,
      'X-CodeSkill-Installer-Format': assetConfig.format,
      'X-CodeSkill-Installer-Type': assetConfig.installerType,
      'X-CodeSkill-Fallback-Url': CANONICAL_RELEASES_PAGE,
    },
  });
}
