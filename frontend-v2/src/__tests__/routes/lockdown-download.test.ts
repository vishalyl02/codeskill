/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { GET as getDownload } from '@/app/api/lockdown/download/route';
import { GET as getManifest } from '@/app/api/lockdown/manifest/route';

describe('LockDown Download & Manifest API Routes', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_LOCKDOWN_CDN_URL;
    delete process.env.LOCKDOWN_CDN_URL;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('GET /api/lockdown/download', () => {
    it('serves or redirects to Windows NSIS .exe installer with appropriate headers', async () => {
      const req = new NextRequest('http://localhost:3000/api/lockdown/download?platform=windows');
      const response = await getDownload(req);

      // Dummy placeholder text files must never be served with 200; they must 302 redirect
      expect(response.status).toBe(302);
      const location = response.headers.get('location');
      expect(location).toContain('CodeSkill-LockDown-Setup.exe');
      expect(location).not.toContain('.msi');
      expect(response.headers.get('content-type')).toBe('application/vnd.microsoft.portable-executable');
      expect(response.headers.get('content-disposition')).toContain('CodeSkill-LockDown-Setup.exe');
      expect(response.headers.get('x-codeskill-installer-format')).toBe('exe');
      expect(response.headers.get('x-codeskill-installer-type')).toBe('nsis');
      expect(response.headers.get('x-codeskill-fallback-url')).toContain('sazamansari/codeskill/releases');
    });

    it('returns json payload when format=json is requested', async () => {
      const req = new NextRequest('http://localhost:3000/api/lockdown/download?platform=windows&format=json');
      const response = await getDownload(req);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.platform).toBe('windows');
      expect(data.filename).toBe('CodeSkill-LockDown-Setup.exe');
      expect(data.format).toBe('exe');
      expect(data.installerType).toBe('nsis');
      expect(data.fallbackUrl).toContain('CodeSkill-LockDown-Setup.exe');
      expect(data.releasesPage).toContain('sazamansari/codeskill/releases');
    });

    it('redirects to CDN when LOCKDOWN_CDN_URL is configured', async () => {
      process.env.LOCKDOWN_CDN_URL = 'https://cdn.codeskill.com/lockdown';
      const req = new NextRequest('http://localhost:3000/api/lockdown/download?platform=windows');
      const response = await getDownload(req);

      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe('https://cdn.codeskill.com/lockdown/CodeSkill-LockDown-Setup.exe');
    });

    it('auto-detects Windows from user-agent if platform query param is absent', async () => {
      process.env.LOCKDOWN_CDN_URL = 'https://cdn.codeskill.com/lockdown';
      const req = new NextRequest('http://localhost:3000/api/lockdown/download', {
        headers: {
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });
      const response = await getDownload(req);

      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe('https://cdn.codeskill.com/lockdown/CodeSkill-LockDown-Setup.exe');
    });

    it('supports macOS platform target', async () => {
      process.env.LOCKDOWN_CDN_URL = 'https://cdn.codeskill.com/lockdown';
      const req = new NextRequest('http://localhost:3000/api/lockdown/download?platform=macos');
      const response = await getDownload(req);

      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe('https://cdn.codeskill.com/lockdown/codeskill-lockdown.dmg');
    });

    it('supports Linux platform target', async () => {
      process.env.LOCKDOWN_CDN_URL = 'https://cdn.codeskill.com/lockdown';
      const req = new NextRequest('http://localhost:3000/api/lockdown/download?platform=linux');
      const response = await getDownload(req);

      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe('https://cdn.codeskill.com/lockdown/codeskill-lockdown.deb');
    });
  });

  describe('GET /api/lockdown/manifest', () => {
    it('returns JSON manifest with Windows .exe NSIS target and never .msi', async () => {
      const response = await getManifest();
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.bundleTargets.windows).toBe('nsis');
      expect(json.platforms.windows.format).toBe('exe');
      expect(json.platforms.windows.filename).toBe('CodeSkill-LockDown-Setup.exe');
      expect(json.platforms.windows.filename).not.toContain('.msi');
      expect(json.platforms.macos.format).toBe('dmg');
      expect(json.platforms.linux.format).toBe('deb');
    });
  });
});
