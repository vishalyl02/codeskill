import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import {
  CANONICAL_REPO,
  CANONICAL_RELEASES_PAGE,
  CANONICAL_LATEST_RELEASE,
  DEFAULT_VERSION,
  getPlatformAssetConfig,
  getPlatformCandidates,
  detectPlatform,
} from '@/lib/lockdown-download-config';

export const dynamic = 'force-dynamic';

function isRealBinary(buffer: Buffer, format: string): boolean {
  if (buffer.length < 10000) return false;

  switch (format) {
    case 'exe':
      return buffer.subarray(0, 2).toString('ascii') === 'MZ';
    case 'dmg':
      return buffer.subarray(-512, -508).toString('ascii') === 'koly';
    case 'deb':
      return buffer.subarray(0, 8).toString('ascii') === '!<arch>\n';
    case 'appimage':
      return buffer.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]));
    default:
      return false;
  }
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
  const assetConfig = getPlatformAssetConfig(platform, format);
  const candidates = getPlatformCandidates(platform, cleanVersion, format);
  const filename = assetConfig.canonicalFilename;
  // Release CI publishes this stable filename for each supported package type.
  const releaseUrl = `https://github.com/${CANONICAL_REPO}/releases/download/${tagParam}/${filename}`;
  const cdnBase = process.env.NEXT_PUBLIC_LOCKDOWN_CDN_URL || process.env.LOCKDOWN_CDN_URL;
  const githubToken = process.env.LOCKDOWN_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
  const cdnUrl = cdnBase ? `${cdnBase.replace(/\/+$/, '')}/${filename}` : null;

  // Optional JSON metadata query
  const acceptsJson = req.headers.get('accept')?.includes('application/json');
  if (format === 'json' || acceptsJson) {
    return NextResponse.json({
      success: true,
      platform,
      version: cleanVersion,
      tag: tagParam,
      filename,
      canonicalFilename: assetConfig.canonicalFilename,
      format: assetConfig.format,
      installerType: assetConfig.installerType,
      configured: Boolean(cdnBase || githubToken),
      url: cdnUrl || releaseUrl,
      candidates,
      fallbackUrl: `${CANONICAL_LATEST_RELEASE}/download/${filename}`,
      releasesPage: CANONICAL_RELEASES_PAGE,
    });
  }

  // 1. Check if CDN base is configured
  if (cdnUrl && !direct) {
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

  // Local binaries are for explicit direct downloads. Normal downloads use the tagged release.
  if (direct) {
    const publicDownloads = path.join(process.cwd(), 'public', 'downloads');
    for (const candidate of candidates) {
      const candidatePath = path.join(publicDownloads, candidate);
      if (!fs.existsSync(candidatePath)) continue;
      try {
        const fileBuffer = fs.readFileSync(candidatePath);
        if (!isRealBinary(fileBuffer, assetConfig.format)) continue;

        return new NextResponse(fileBuffer, {
          status: 200,
          headers: {
            'Content-Type': assetConfig.contentType,
            'Content-Disposition': `attachment; filename="${candidate}"`,
            'Content-Length': fileBuffer.byteLength.toString(),
            'Cache-Control': 'public, max-age=300, s-maxage=3600',
            'X-CodeSkill-Installer-Version': cleanVersion,
            'X-CodeSkill-Installer-Tag': tagParam,
            'X-CodeSkill-Installer-Format': assetConfig.format,
            'X-CodeSkill-Installer-Type': assetConfig.installerType,
          },
        });
      } catch {
        // Try the next local candidate before falling back to the release.
      }
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
  return NextResponse.redirect(releaseUrl, {
    status: 302,
    headers: {
      'Content-Type': assetConfig.contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'X-CodeSkill-Installer-Version': cleanVersion,
      'X-CodeSkill-Installer-Tag': tagParam,
      'X-CodeSkill-Installer-Format': assetConfig.format,
      'X-CodeSkill-Installer-Type': assetConfig.installerType,
      'X-CodeSkill-Fallback-Url': CANONICAL_RELEASES_PAGE,
    },
  });
}
