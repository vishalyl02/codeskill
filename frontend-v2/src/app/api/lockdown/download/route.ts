import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import {
  CANONICAL_REPO,
  CANONICAL_RELEASES_PAGE,
  CANONICAL_LATEST_RELEASE,
  DEFAULT_VERSION,
  PLATFORM_CONFIG,
  getPlatformCandidates,
  detectPlatform,
} from '@/lib/lockdown-download-config';

export const dynamic = 'force-dynamic';

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
