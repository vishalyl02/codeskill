import { Test, TestingModule } from '@nestjs/testing';
import { LockdownDownloadController } from './lockdown-download.controller';
import type { Request, Response } from 'express';

describe('LockdownDownloadController', () => {
  let controller: LockdownDownloadController;
  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = { ...originalEnv };
    delete process.env.LOCKDOWN_CDN_URL;
    delete process.env.NEXT_PUBLIC_LOCKDOWN_CDN_URL;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LockdownDownloadController],
    }).compile();

    controller = module.get<LockdownDownloadController>(LockdownDownloadController);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('downloadLockdown', () => {
    it('redirects with 302 to Windows NSIS executable and sets proper headers', async () => {
      const setHeaders: Record<string, string> = {};
      let redirectedUrl = '';
      let redirectedStatus = 0;

      const mockReq = {
        headers: {
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        },
      } as unknown as Request;

      const mockRes = {
        set: jest.fn((headers) => Object.assign(setHeaders, headers)),
        redirect: jest.fn((status, url) => {
          redirectedStatus = status;
          redirectedUrl = url;
        }),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response;

      await controller.downloadLockdown('windows', undefined, mockReq, mockRes);

      expect(redirectedStatus).toBe(302);
      expect(redirectedUrl).toContain('CodeSkill-LockDown-Setup.exe');
      expect(redirectedUrl).not.toContain('.msi');
      expect(setHeaders['Content-Type']).toBe('application/vnd.microsoft.portable-executable');
      expect(setHeaders['Content-Disposition']).toBe('attachment; filename="CodeSkill-LockDown-Setup.exe"');
      expect(setHeaders['X-CodeSkill-Installer-Format']).toBe('exe');
      expect(setHeaders['X-CodeSkill-Installer-Type']).toBe('nsis');
    });

    it('returns json response when redirect=false is passed', async () => {
      let jsonPayload: any = null;
      let responseStatus = 0;

      const mockReq = {
        headers: {},
      } as unknown as Request;

      const mockRes = {
        set: jest.fn(),
        status: jest.fn((status) => {
          responseStatus = status;
          return {
            json: jest.fn((data) => { jsonPayload = data; }),
          };
        }),
      } as unknown as Response;

      await controller.downloadLockdown('windows', 'false', mockReq, mockRes);

      expect(responseStatus).toBe(200);
      expect(jsonPayload).toBeDefined();
      expect(jsonPayload.success).toBe(true);
      expect(jsonPayload.platform).toBe('windows');
      expect(jsonPayload.filename).toBe('CodeSkill-LockDown-Setup.exe');
      expect(jsonPayload.format).toBe('exe');
      expect(jsonPayload.installerType).toBe('nsis');
      expect(jsonPayload.url).toContain('CodeSkill-LockDown-Setup.exe');
    });

    it('redirects to CDN base when configured in environment', async () => {
      process.env.LOCKDOWN_CDN_URL = 'https://cdn.example.com/assets';
      let redirectedUrl = '';

      const mockReq = {
        headers: {},
      } as unknown as Request;

      const mockRes = {
        set: jest.fn(),
        redirect: jest.fn((_status, url) => { redirectedUrl = url; }),
      } as unknown as Response;

      await controller.downloadLockdown('windows', undefined, mockReq, mockRes);
      expect(redirectedUrl).toBe('https://cdn.example.com/assets/CodeSkill-LockDown-Setup.exe');
    });

    it('handles macos and linux platforms correctly', async () => {
      let macUrl = '';
      let linuxUrl = '';

      const mockReq = { headers: {} } as unknown as Request;
      const mockResMac = {
        set: jest.fn(),
        redirect: jest.fn((_status, url) => { macUrl = url; }),
      } as unknown as Response;
      const mockResLinux = {
        set: jest.fn(),
        redirect: jest.fn((_status, url) => { linuxUrl = url; }),
      } as unknown as Response;

      await controller.downloadLockdown('macos', undefined, mockReq, mockResMac);
      expect(macUrl).toContain('codeskill-lockdown.dmg');

      await controller.downloadLockdown('linux', undefined, mockReq, mockResLinux);
      expect(linuxUrl).toContain('codeskill-lockdown.deb');
    });
  });

  describe('getManifest', () => {
    it('returns structured manifest referencing Windows NSIS .exe and never .msi', () => {
      const manifest = controller.getManifest();
      expect(manifest.success).toBe(true);
      expect(manifest.bundleTargets.windows).toBe('nsis');
      expect(manifest.platforms.windows.format).toBe('exe');
      expect(manifest.platforms.windows.filename).toBe('CodeSkill-LockDown-Setup.exe');
      expect(manifest.platforms.windows.filename).not.toContain('.msi');
      expect(manifest.platforms.windows.installerType).toBe('nsis');
      expect(manifest.platforms.macos.format).toBe('dmg');
      expect(manifest.platforms.linux.format).toBe('deb');
    });
  });
});
