import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const artifacts = path.resolve('.test-artifacts');
await fs.mkdir(artifacts, { recursive: true });
const root = await fs.mkdtemp(path.join(artifacts, 'mac-features-'));
const bundle = path.join(root, 'services.mjs');
await build({
  stdin: {
    contents: 'export * from "./electron/services/organizer"; export * from "./electron/services/folderWatch"; export * from "./electron/lib/macFileMetadata";',
    resolveDir: process.cwd(),
  },
  outfile: bundle, bundle: true, platform: 'node', format: 'esm',
});
const { runOrganizeJob, undoOperations, watchArrivals, metadataFolder, updateFinderTag } = await import(pathToFileURL(bundle));
const source = path.join(root, 'source');
const dest = path.join(root, 'dest');
await fs.mkdir(source);
const category = { id: 'docs', name: 'Documents', enabled: true, extensions: ['txt'], subfolders: false };
const request = {
  sourcePath: source, destPath: dest, categories: [category],
  filters: { dateModified: 'any', fileSize: 'any', excludeHidden: true }, conflictResolution: 'rename',
};
const existing = path.join(source, 'existing.txt');
await fs.writeFile(existing, 'Existing file');
const candidate = path.join(source, 'arrival.txt');
const incomplete = path.join(source, 'arrival.txt.crdownload');
const watchErrors = [];
let watchedResult;
const watcher = watchArrivals(request, async arrivals => {
  watchedResult = await runOrganizeJob(request, {}, arrivals);
  return watchedResult.success;
}, error => watchErrors.push(error), { settleMs: 600, idleRescanMs: 600 });
try {
  await delay(350);
  await fs.writeFile(incomplete, 'incomplete');
  await delay(750);
  assert.equal(watchedResult, undefined);
  await fs.rename(incomplete, candidate);
  await delay(350);
  await fs.appendFile(candidate, ' and complete');
  await delay(300);
  assert.equal(watchedResult, undefined);
  for (let i = 0; i < 40 && !watchedResult; i += 1) await delay(100);
  assert.deepEqual(watchErrors, []);
  assert.equal(watchedResult?.moved, 1);
  assert.equal(await fs.readFile(path.join(dest, 'Documents', 'arrival.txt'), 'utf8'), 'incomplete and complete');
  assert.equal(await fs.readFile(existing, 'utf8'), 'Existing file');
  assert.ok((await undoOperations(watchedResult.operations, watcher.ignore)).success);
  await delay(1600);
  assert.equal(await fs.readFile(candidate, 'utf8'), 'incomplete and complete');
  assert.deepEqual(watchErrors, []);
} finally {
  watcher.stop();
}

const sameContent = path.join(source, 'z-copy.txt');
const nameCollision = path.join(dest, 'Documents', 'existing.txt');
await fs.copyFile(existing, sameContent);
await fs.writeFile(nameCollision, 'Different bytes');
const trashed = [];
const trashRun = await runOrganizeJob({
  ...request, categories: [{ ...category, duplicateDetection: true }], conflictResolution: 'trash',
}, { trashFile: async file => {
  trashed.push(file);
  await fs.rename(file, path.join(root, 'recoverable-duplicate.txt'));
} });
assert.deepEqual(trashed, [sameContent]);
assert.equal(trashRun.trashed, 1);
assert.equal(trashRun.operations.length, 2);
assert.equal(await fs.readFile(nameCollision, 'utf8'), 'Different bytes');
assert.ok(trashRun.operations.some(operation => operation.newName === 'existing (1).txt'));

if (process.platform === 'darwin') {
  const taggedFile = path.join(source, 'tagged.txt');
  await fs.writeFile(taggedFile, 'Tag fixture');
  await updateFinderTag(taggedFile, 'Personal', 'add');
  const tagRun = await runOrganizeJob({ ...request, destPath: '', organizationMode: 'tags' });
  assert.equal(tagRun.tagged, 1);
  assert.equal(await updateFinderTag(taggedFile, 'Documents', 'add'), false, 'Category tag already exists');
  assert.ok((await undoOperations(tagRun.operations)).success);
  assert.equal(await updateFinderTag(taggedFile, 'Personal', 'add'), false, 'Undo preserves pre-existing tags');
  assert.equal(await updateFinderTag(taggedFile, 'Documents', 'remove'), false, 'Undo removed only the Tidy tag');

  const origins = '<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><array><string>https://files.example.org/download?q=private</string></array></plist>';
  const originPlist = execFileSync('/usr/bin/plutil', ['-convert', 'binary1', '-o', '-', '-'], { input: origins });
  execFileSync('/usr/bin/xattr', ['-wx', 'com.apple.metadata:kMDItemWhereFroms', originPlist.toString('hex'), taggedFile]);
  assert.deepEqual(await metadataFolder(taggedFile, 'website'), ['files.example.org']);
  const grouped = await runOrganizeJob({ ...request, metadataGrouping: 'website' });
  assert.equal(grouped.operations[0].newPath, path.join(dest, 'Documents', 'files.example.org', 'tagged.txt'));

  // Insert a minimal little-endian EXIF directory into a valid JPEG.
  const fixture = path.join(root, 'photo-fixture.jpg');
  execFileSync('/usr/bin/sips', ['-s', 'format', 'jpeg', 'assets/icon.png', '--out', fixture]);
  const jpeg = await fs.readFile(fixture);
  const tiff = Buffer.alloc(64);
  tiff.write('II', 0);
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(1, 8);
  tiff.writeUInt16LE(0x8769, 10);
  tiff.writeUInt16LE(4, 12);
  tiff.writeUInt32LE(1, 14);
  tiff.writeUInt32LE(26, 18);
  tiff.writeUInt16LE(1, 26);
  tiff.writeUInt16LE(0x9003, 28);
  tiff.writeUInt16LE(2, 30);
  tiff.writeUInt32LE(20, 32);
  tiff.writeUInt32LE(44, 36);
  tiff.write('2019:07:18 09:30:00\0', 44);
  const header = Buffer.from([0xff, 0xe1, 0, tiff.length + 8]);
  const photo = path.join(source, 'camera.jpg');
  await fs.writeFile(photo, Buffer.concat([jpeg.subarray(0, 2), header, Buffer.from('Exif\0\0'), tiff, jpeg.subarray(2)]));
  assert.deepEqual(await metadataFolder(photo, 'photo-date'), ['2019', '07']);
  const photoRun = await runOrganizeJob({
    ...request,
    categories: [{ ...category, name: 'Images', extensions: ['jpg'] }],
    metadataGrouping: 'photo-date',
  });
  assert.equal(photoRun.operations[0].newPath, path.join(dest, 'Images', '2019', '07', 'camera.jpg'));
}
console.log('PASS folder arrivals settle before moving, Undo suppresses reprocessing, Trash policy preserves name collisions, and native tags and metadata work');
