import { NextResponse } from 'next/server';
import {
  DEFAULT_VERSION,
  DEFAULT_TAG,
  CANONICAL_REPO,
  getPlatformCandidates,
  PLATFORM_CONFIG,
} from '@/lib/lockdown-download-config';

export const dynamic = 'force-dynamic';

const CURRENT_VERSION = DEFAULT_VERSION;

export async function GET() {
  const cdnBase = (process.env.NEXT_PUBLIC_LOCKDOWN_CDN_URL || process.env.LOCKDOWN_CDN_URL || '').replace(/\/+$/, '');
  const releasesBase = `https://github.com/${CANONICAL_REPO}/releases/latest`;
  const releasesPage = `https://github.com/${CANONICAL_REPO}/releases`;
  const tag = DEFAULT_TAG;

  const winCandidates = getPlatformCandidates('windows', CURRENT_VERSION);
  const macCandidates = getPlatformCandidates('macos', CURRENT_VERSION);
  const linuxCandidates = getPlatformCandidates('linux', CURRENT_VERSION);

  return NextResponse.json({
    success: true,
    version: CURRENT_VERSION,
    tag,
    productName: 'CodeSkill LockDown',
    bundleTargets: {
      windows: 'nsis',
      macos: 'dmg',
      linux: 'deb',
    },
    platforms: {
      windows: {
        os: 'windows',
        installerType: 'nsis',
        format: 'exe',
        filename: PLATFORM_CONFIG.windows.canonicalFilename,
        candidates: winCandidates,
        downloadUrl: `/api/lockdown/download?platform=windows&version=${CURRENT_VERSION}`,
        cdnUrl: cdnBase ? `${cdnBase}/CodeSkill-LockDown-Setup.exe` : null,
        fallbackUrl: `${releasesBase}/download/CodeSkill-LockDown-Setup.exe`,
        releasesPage,
      },
      macos: {
        os: 'macos',
        installerType: 'dmg',
        format: 'dmg',
        filename: PLATFORM_CONFIG.macos.canonicalFilename,
        candidates: macCandidates,
        downloadUrl: `/api/lockdown/download?platform=macos&version=${CURRENT_VERSION}`,
        cdnUrl: cdnBase ? `${cdnBase}/codeskill-lockdown.dmg` : null,
        fallbackUrl: `${releasesBase}/download/codeskill-lockdown.dmg`,
        releasesPage,
      },
      linux: {
        os: 'linux',
        installerType: 'deb',
        format: 'deb',
        filename: PLATFORM_CONFIG.linux.canonicalFilename,
        candidates: linuxCandidates,
        downloadUrl: `/api/lockdown/download?platform=linux&version=${CURRENT_VERSION}`,
        cdnUrl: cdnBase ? `${cdnBase}/codeskill-lockdown.deb` : null,
        fallbackUrl: `${releasesBase}/download/codeskill-lockdown.deb`,
        releasesPage,
      },
    },
  });
}
