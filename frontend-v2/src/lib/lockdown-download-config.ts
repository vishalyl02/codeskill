import { NextRequest } from 'next/server';

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
