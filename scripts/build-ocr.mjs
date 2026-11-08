import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

if (process.platform === 'darwin') {
  const source = 'native/TidyOCR.swift';
  const target = 'build/tidy-ocr';
  const arch = process.argv.includes('--arm64') ? 'arm64' : process.arch === 'x64' ? 'x86_64' : process.arch;
  const current = fs.existsSync(target) && fs.existsSync(target + '.arch') &&
    fs.readFileSync(target + '.arch', 'utf8') === arch &&
    fs.statSync(target).mtimeMs >= fs.statSync(source).mtimeMs;
  if (!current) {
    fs.mkdirSync('build/swift-module-cache', { recursive: true });
    execFileSync('/usr/bin/xcrun', ['swiftc', '-O', '-target', `${arch}-apple-macos12.0`,
      '-module-cache-path', 'build/swift-module-cache', source, '-o', target + '.tmp'], { stdio: 'inherit' });
    fs.renameSync(target + '.tmp', target);
    fs.writeFileSync(target + '.arch', arch);
  }
}
