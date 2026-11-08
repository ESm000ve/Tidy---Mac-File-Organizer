import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const credentialGroups = [
  ['APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID'],
  ['APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER'],
  ['APPLE_KEYCHAIN_PROFILE'],
];
if (!credentialGroups.some(group => group.every(key => process.env[key]?.trim()))) {
  console.error('Configure Apple notarization credentials before building a distribution release. See README.md.');
  process.exit(1);
}

if (!process.env.CSC_LINK) {
  const identities = execFileSync('/usr/bin/security', ['find-identity', '-v', '-p', 'codesigning'], { encoding: 'utf8' });
  if (!identities.includes('"Developer ID Application:')) {
    console.error('Install a Developer ID Application certificate with its private key before building a distribution release.');
    process.exit(1);
  }
}

const { version } = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'tidy-distribution-'));
try {
  execFileSync('npm', ['run', 'build:mac', '--', '--config.forceCodeSigning=true', `--config.directories.output=${staging}`], { stdio: 'inherit' });
  const app = path.join(staging, 'mac-arm64', 'Tidy.app');
  const developerId = 'anchor apple generic and certificate leaf[field.1.2.840.113635.100.6.1.13] exists';
  execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', '-R', developerId, app], { stdio: 'inherit' });
  execFileSync('/usr/bin/xcrun', ['stapler', 'validate', app], { stdio: 'inherit' });
  const installer = `Tidy-${version}-arm64.dmg`;
  const release = path.join('release', 'macos');
  fs.mkdirSync(release, { recursive: true });
  fs.copyFileSync(path.join(staging, installer), path.join(release, installer + '.tmp'));
  fs.renameSync(path.join(release, installer + '.tmp'), path.join(release, installer));
  console.log(`Verified distribution installer: ${path.join(release, installer)}`);
} finally {
  fs.rmSync(staging, { recursive: true, force: true });
}
