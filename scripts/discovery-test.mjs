import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { _electron as electron } from 'playwright';

// A self-contained one-page receipt. Vision sees the rendered page, as it
// would for an image-only scan, and the same fixture can become a screenshot.
function receiptPdf() {
  const text = 'BT /F1 42 Tf 35 560 Td (MAPLE STREET CAFE) Tj 0 -62 Td (RECEIPT) Tj /F1 32 Tf 0 -60 Td (Date: 2026-02-12) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 650] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = objects.map((object, index) => {
    const offset = pdf.length;
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return String(offset).padStart(10, '0') + ' 00000 n \n';
  });
  return pdf + `xref\n0 6\n0000000000 65535 f \n${offsets.join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${pdf.length}\n%%EOF\n`;
}

const artifacts = path.resolve('.test-artifacts');
await fs.mkdir(artifacts, { recursive: true });
const root = await fs.mkdtemp(path.join(artifacts, 'discovery-'));
const source = path.join(root, 'source');
const dest = path.join(root, 'destination');
await fs.mkdir(source);
await fs.mkdir(path.join(dest, 'Leases'), { recursive: true });
await fs.mkdir(path.join(dest, '.Tidy Undo'));
await fs.writeFile(path.join(dest, 'Leases', 'Apartment Rental Contract.txt'), 'Synthetic lease');
await fs.writeFile(path.join(dest, '.Tidy Undo', 'Lease agreement.txt'), 'Excluded backup');
const scan = path.join(source, 'Scan_001.pdf');
await fs.writeFile(scan, receiptPdf());
if (process.platform === 'darwin') {
  execFileSync('/usr/bin/sips', ['-s', 'format', 'png', scan, '--out', path.join(source, 'Screenshot 2026-10-22.png')]);
}
const old = path.join(source, 'old.txt');
await fs.writeFile(old, 'Old test fixture');
await fs.utimes(old, new Date('2020-01-01T00:00:00Z'), new Date('2020-01-01T00:00:00Z'));
await fs.writeFile(path.join(source, 'recent.txt'), 'Recent test fixture');

const env = { ...process.env, GEMINI_API_KEY: '' };
delete env.ELECTRON_RUN_AS_NODE;
const executablePath = process.env.TIDY_EXECUTABLE;
const app = await electron.launch({
  executablePath, args: [...(executablePath ? [] : ['.']), `--user-data-dir=${path.join(root, 'profile')}`], env, timeout: 60000,
});
try {
  const page = await app.firstWindow();
  await page.locator('#main-content').waitFor();
  await page.evaluate(({ source, dest }) => {
    localStorage.setItem('tidy_source_path', source);
    localStorage.setItem('tidy_dest_path', dest);
  }, { source, dest });
  await page.reload();
  await page.getByRole('button', { name: 'Find organized files' }).click();
  const search = page.getByRole('dialog', { name: 'Find organized files' });
  await search.getByRole('searchbox', { name: 'Describe a file' }).fill('Find my lease agreement');
  await search.getByRole('button', { name: 'Search', exact: true }).click();
  await search.getByText('Apartment Rental Contract.txt', { exact: true }).waitFor();
  assert.equal(await search.getByText('Lease agreement.txt', { exact: true }).count(), 0);
  await search.getByRole('button', { name: 'Close file search' }).click();

  await page.getByRole('combobox', { name: 'Date modified', exact: true }).click();
  await page.getByRole('option', { name: 'Older than…' }).click();
  await page.getByRole('spinbutton', { name: 'Older than days' }).fill('45');
  await page.getByRole('button', { name: 'Run Tidy', exact: true }).click();
  const preview = page.getByRole('dialog', { name: 'Preview Changes' });
  await preview.getByText('old.txt', { exact: true }).waitFor();
  assert.equal(await preview.getByText('recent.txt', { exact: true }).count(), 0);
  await preview.getByRole('button', { name: 'Confirm & Run' }).click();
  await preview.getByRole('heading', { name: 'Tidy Complete!' }).waitFor();
  assert.equal(await fs.readFile(path.join(dest, 'Documents', 'txt', 'old.txt'), 'utf8'), 'Old test fixture');
  assert.equal(await fs.readFile(path.join(source, 'recent.txt'), 'utf8'), 'Recent test fixture');
  await preview.getByRole('button', { name: 'Done', exact: true }).click();
  await preview.waitFor({ state: 'hidden' });

  if (process.platform === 'darwin') {
    const result = await page.evaluate(async ({ sourcePath, destPath }) => {
      const categories = [{ id: 'docs', name: 'Documents', enabled: true, extensions: ['pdf', 'png'], subfolders: true, smartCategorization: true }];
      const filters = { dateModified: 'any', fileSize: 'any', excludeHidden: true };
      const scope = { renameEngine: 'on-device', metadataGrouping: 'content-year' };
      const files = await window.electron.getFolderPreview(sourcePath, categories, true, filters, 'descriptive', scope);
      if (!files.every(file => file.smartRename?.source === 'ocr')) return { files };
      const renames = Object.fromEntries(files.map(file => [file.relativePath, file.smartRename]));
      const run = await window.electron.organizeFiles({ sourcePath, destPath, categories, filters, conflictResolution: 'rename', metadataGrouping: scope.metadataGrouping, renames });
      return { files, run };
    }, { sourcePath: source, destPath: dest });
    assert.equal(result.files.length, 2);
    for (const file of result.files) {
      assert.equal(file.smartRename?.source, 'ocr');
      assert.match(file.smartRename.suggested, /MAPLE_STREET_CAFE/i);
      assert.equal(file.smartRename.subfolder, 'Receipts');
      assert.equal(file.contentYear, '2026');
    }
    assert.equal(result.run?.moved, 2);
    assert.equal((await fs.readdir(path.join(dest, 'Documents', 'Receipts', '2026'))).length, 2);
  }

  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('ai:suggestFolderRules');
    ipcMain.handle('ai:suggestFolderRules', () => ({ success: true, sampleCount: 2,
      data: { newCategories: [{ name: 'Test archive', extensions: ['txt'], subfolders: false }] } }));
  });
  const suggest = page.getByRole('button', { name: 'Suggest rules for this folder' });
  await suggest.click();
  const review = page.getByRole('dialog', { name: 'Review folder rules' });
  await review.getByText('Test archive (.txt)', { exact: true }).waitFor();
  await review.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(await page.getByRole('heading', { name: 'Test archive', exact: true }).count(), 0);
  await suggest.click();
  await review.getByRole('button', { name: 'Apply rules', exact: true }).click();
  await page.getByRole('heading', { name: 'Test archive', exact: true }).waitFor();
  console.log('PASS local file search, older-than preview, reviewed folder rules, Vision OCR for PDFs and screenshots, and dated content folders');
} finally {
  await app.close();
}
