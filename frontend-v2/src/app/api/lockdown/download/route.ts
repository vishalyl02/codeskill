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
  const githubToken = process.env.LOCKDOWN_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
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
      configured: Boolean(cdnBase || githubToken),
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
      // Fall through to GitHub Releases
    }
  }

  // 3. Authenticated GitHub Release Asset Proxy (for private repos)
  // When LOCKDOWN_GITHUB_TOKEN or GITHUB_TOKEN is set, exchanges the asset for a signed AWS S3 download link
  if (githubToken) {
    try {
      const releaseApiUrl = `https://api.github.com/repos/${CANONICAL_REPO}/releases/tags/${tagParam}`;
      const releaseRes = await fetch(releaseApiUrl, {
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'CodeSkill-Installer-Downloader',
        },
      });

      if (releaseRes.ok) {
        const releaseData = await releaseRes.json();
        const assets: Array<{ id: number; name: string }> = releaseData.assets || [];

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

          // GitHub API responds with 302 pointing to pre-signed AWS S3 URL
          const signedS3Url = assetRes.headers.get('location');
          if (signedS3Url) {
            return NextResponse.redirect(signedS3Url, {
              status: 302,
              headers: {
                'Content-Type': assetConfig.contentType,
                'Content-Disposition': `attachment; filename="${matchedAsset.name}"`,
                'X-CodeSkill-Installer-Version': cleanVersion,
                'X-CodeSkill-Installer-Tag': tagParam,
                'X-CodeSkill-Installer-Format': assetConfig.format,
                'X-CodeSkill-Installer-Type': assetConfig.installerType,
                'X-CodeSkill-Asset-Source': 'github-signed-s3',
              },
            });
          }
        }
      }
    } catch (apiErr) {
      console.warn('[LockDown Downloader] GitHub API token proxy notice:', apiErr);
    }
  }

  // 4. Fallback to canonical GitHub Releases asset for this version tag
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
