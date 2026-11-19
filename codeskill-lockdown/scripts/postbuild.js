const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const plistPaths = [
  path.join(__dirname, '../src-tauri/target/debug/bundle/macos/CodeSkill LockDown.app/Contents/Info.plist'),
  path.join(__dirname, '../src-tauri/target/release/bundle/macos/CodeSkill LockDown.app/Contents/Info.plist'),
];

for (const plist of plistPaths) {
  if (fs.existsSync(plist)) {
    try {
      execSync(`/usr/libexec/PlistBuddy -c "Print CFBundleURLTypes" "${plist}"`, { stdio: 'ignore' });
    } catch {
      try {
        execSync(`/usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes array" "${plist}"`);
        execSync(`/usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:0 dict" "${plist}"`);
        execSync(`/usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:0:CFBundleURLName string com.codeskill.lockdown" "${plist}"`);
        execSync(`/usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes array" "${plist}"`);
        execSync(`/usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes:0 string codeskill-exam" "${plist}"`);
        const appDir = path.dirname(path.dirname(plist));
        execSync(`/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister -f "${appDir}"`);
      } catch (e) {
        console.warn('Failed to inject CFBundleURLTypes into ' + plist, e.message);
      }
    }
  }
}
