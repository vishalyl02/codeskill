const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const binaryMappings = [
  {
    src: path.join(__dirname, '../src-tauri/target/debug/codeskill-lockdown'),
    dest: path.join(__dirname, '../src-tauri/target/debug/bundle/macos/CodeSkill LockDown.app/Contents/MacOS/codeskill-lockdown'),
  },
  {
    src: path.join(__dirname, '../src-tauri/target/release/codeskill-lockdown'),
    dest: path.join(__dirname, '../src-tauri/target/release/bundle/macos/CodeSkill LockDown.app/Contents/MacOS/codeskill-lockdown'),
  },
];

for (const { src, dest } of binaryMappings) {
  if (fs.existsSync(src)) {
    try {
      const destDir = path.dirname(dest);
      if (fs.existsSync(destDir)) {
        fs.copyFileSync(src, dest);
        fs.chmodSync(dest, 0o755);
        console.log(`[postbuild] Synced native binary to ${dest}`);
      }
    } catch (e) {
      console.warn(`[postbuild] Failed to sync native binary: ${e.message}`);
    }
  }
}

const plistPaths = [
  path.join(__dirname, '../src-tauri/target/debug/bundle/macos/CodeSkill LockDown.app/Contents/Info.plist'),
  path.join(__dirname, '../src-tauri/target/release/bundle/macos/CodeSkill LockDown.app/Contents/Info.plist'),
];

let validAppDir = null;

for (const plist of plistPaths) {
  if (fs.existsSync(plist)) {
    try {
      try {
        execSync(`/usr/libexec/PlistBuddy -c "Delete :CFBundleURLTypes" "${plist}"`, { stdio: 'ignore' });
      } catch {}
      execSync(`/usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes array" "${plist}"`);
      execSync(`/usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:0 dict" "${plist}"`);
      execSync(`/usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:0:CFBundleURLName string com.codeskill.lockdown" "${plist}"`);
      execSync(`/usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes array" "${plist}"`);
      execSync(`/usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes:0 string codeskill-exam" "${plist}"`);
      execSync(`/usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes:1 string codeskill-lockdown" "${plist}"`);
      const appDir = path.dirname(path.dirname(plist));

      // Clean extended attributes and re-sign bundle so Gatekeeper recognizes it as a valid signature
      try {
        execSync(`xattr -cr "${appDir}"`);
        execSync(`codesign --force --deep --sign - "${appDir}"`);
        console.log(`[postbuild] Re-signed app bundle cleanly: ${appDir}`);
        validAppDir = appDir;
      } catch (signErr) {
        console.warn('[postbuild] Warning re-signing app bundle:', signErr.message);
      }

      execSync(`/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister -f "${appDir}"`);
      console.log(`[postbuild] Registered deep-link schemes (codeskill-exam, codeskill-lockdown) for ${appDir}`);
    } catch (e) {
      console.warn('[postbuild] Failed to inject CFBundleURLTypes into ' + plist, e.message);
    }
  }
}

// Package the re-signed .app into frontend-v2/public/downloads/codeskill-lockdown.dmg
const frontendDownloadsDir = path.join(__dirname, '../../frontend-v2/public/downloads');
if (validAppDir && fs.existsSync(validAppDir)) {
  try {
    fs.mkdirSync(frontendDownloadsDir, { recursive: true });
    const stagingDir = path.join(__dirname, '../dist-dmg');
    if (fs.existsSync(stagingDir)) {
      fs.rmSync(stagingDir, { recursive: true, force: true });
    }
    fs.mkdirSync(stagingDir, { recursive: true });

    // Copy re-signed .app into staging
    execSync(`cp -R "${validAppDir}" "${stagingDir}/"`);
    // Create Applications shortcut
    execSync(`ln -s /Applications "${stagingDir}/Applications"`);
    // Strip extended attributes in staging
    execSync(`xattr -cr "${stagingDir}"`);
    execSync(`codesign --force --deep --sign - "${stagingDir}/CodeSkill LockDown.app"`);

    const targetDmg = path.join(frontendDownloadsDir, 'codeskill-lockdown.dmg');
    if (fs.existsSync(targetDmg)) {
      fs.unlinkSync(targetDmg);
    }

    execSync(`hdiutil create -volname "CodeSkill LockDown" -srcfolder "${stagingDir}" -ov -format UDZO "${targetDmg}"`);
    execSync(`xattr -cr "${targetDmg}"`);
    fs.rmSync(stagingDir, { recursive: true, force: true });
    console.log(`[postbuild] Packaged signed DMG installer at ${targetDmg}`);
  } catch (e) {
    console.warn(`[postbuild] Failed to package signed DMG: ${e.message}`);
  }
}
