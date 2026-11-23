import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const CANONICAL_REPO = 'sazamansari/codeskill';
const CURRENT_VERSION = '1.0.0';

export async function GET() {
  const cdnBase = (process.env.NEXT_PUBLIC_LOCKDOWN_CDN_URL || process.env.LOCKDOWN_CDN_URL || '').replace(/\/+$/, '');
  const releasesBase = `https://github.com/${CANONICAL_REPO}/releases/latest`;
  const releasesPage = `https://github.com/${CANONICAL_REPO}/releases`;

  return NextResponse.json({
    success: true,
    version: CURRENT_VERSION,
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
        filename: 'CodeSkill-LockDown-Setup.exe',
        downloadUrl: '/api/lockdown/download?platform=windows',
        cdnUrl: cdnBase ? `${cdnBase}/CodeSkill-LockDown-Setup.exe` : null,
        fallbackUrl: `${releasesBase}/download/CodeSkill-LockDown-Setup.exe`,
        releasesPage,
      },
      macos: {
        os: 'macos',
        installerType: 'dmg',
        format: 'dmg',
        filename: 'codeskill-lockdown.dmg',
        downloadUrl: '/api/lockdown/download?platform=macos',
        cdnUrl: cdnBase ? `${cdnBase}/codeskill-lockdown.dmg` : null,
        fallbackUrl: `${releasesBase}/download/codeskill-lockdown.dmg`,
        releasesPage,
      },
      linux: {
        os: 'linux',
        installerType: 'deb',
        format: 'deb',
        filename: 'codeskill-lockdown.deb',
        downloadUrl: '/api/lockdown/download?platform=linux',
        cdnUrl: cdnBase ? `${cdnBase}/codeskill-lockdown.deb` : null,
        fallbackUrl: `${releasesBase}/download/codeskill-lockdown.deb`,
        releasesPage,
      },
    },
  });
}
