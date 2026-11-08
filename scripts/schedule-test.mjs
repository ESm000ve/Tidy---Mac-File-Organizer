import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import electronExecutable from 'electron';
import { _electron as electron } from 'playwright';

const artifacts = path.resolve('.test-artifacts');
await fs.mkdir(artifacts, { recursive: true });
const root = await fs.mkdtemp(path.join(artifacts, 'schedule-'));
const profile = path.join(root, 'profile');
const source = path.join(root, 'source');
const dest = path.join(root, 'destination');
await fs.mkdir(source);
await fs.writeFile(path.join(source, 'report.txt'), 'Scheduled file fixture');
const scheduledFile = path.join(dest, 'Filed reports', 'report.txt');
const executablePath = process.env.TIDY_EXECUTABLE;
const args = [...(executablePath ? [] : ['.']), `--user-data-dir=${profile}`];
const env = { ...process.env, GEMINI_API_KEY: '' };
delete env.ELECTRON_RUN_AS_NODE;
const launch = () => electron.launch({ executablePath, args, env, timeout: 60000 });
const launchctl = (...arguments_) => execFileSync('/bin/launchctl', arguments_, { encoding: 'utf8', stdio: 'pipe' });
const scheduledProcess = () => execFileSync('/bin/ps', ['-axo', 'pid=,args='], { encoding: 'utf8' })
  .split('\n')
  .find(line => line.includes(executablePath) && line.includes('--tidy-scheduled-run') &&
    line.includes(`--user-data-dir=${profile}`) && !line.includes('--type='))
  ?.trim().split(/\s+/, 1)[0];
const testHome = path.join(root, 'home');
await fs.mkdir(testHome);

let app = await launch();
let service;
try {
  let page = await app.firstWindow();
  await page.locator('#main-content').waitFor();
  const appInfo = await app.evaluate(({ app }, home) => {
    app.setPath('home', home);
    return { packaged: app.isPackaged, userData: app.getPath('userData') };
  }, testHome);
  const label = 'com.ericauzenne.tidy.schedule.' + createHash('sha256').update(appInfo.userData).digest('hex').slice(0, 16);
  if (appInfo.packaged) service = `gui/${process.getuid()}/${label}`;

  await page.evaluate(({ source, dest }) => {
    localStorage.setItem('tidy_source_path', source);
    localStorage.setItem('tidy_dest_path', dest);
    localStorage.setItem('tidy_categories', JSON.stringify([
      { id: 'filed-reports', name: 'Filed reports', enabled: true, extensions: ['txt'], subfolders: false },
    ]));
  }, { source, dest });
  await page.reload();
  await page.getByRole('radio', { name: 'Daily' }).click();
  await page.getByLabel('Schedule time').fill('03:14');
  const configPath = path.join(appInfo.userData, 'organize-schedule.json');
  let config;
  for (let i = 0; i < 50; i += 1) {
    config = JSON.parse(await fs.readFile(configPath, 'utf8').catch(() => 'null'));
    if (config?.schedule.time === '03:14') break;
    await delay(100);
  }
  assert.equal(config?.schedule.time, '03:14');
  assert.equal(config.categories[0].name, 'Filed reports');
  if (service) assert.match(launchctl('print', service), /com\.ericauzenne\.tidy\.schedule/);

  // On the second packaged launch the test's redirected home is gone.
  // Let that window open in Manual mode so it cannot install a real plist.
  if (service) await page.evaluate(() => localStorage.setItem('tidy_schedule_type', 'manual'));
  await app.close();
  app = undefined;
  if (service) {
    launchctl('kickstart', service);
    for (let i = 0; i < 100; i += 1) {
      if (await fs.stat(path.join(appInfo.userData, 'organize-undo.json')).catch(() => null)) break;
      await delay(100);
    }
    const processId = scheduledProcess();
    if (processId) {
      process.kill(Number(processId), 'SIGTERM');
      for (let i = 0; i < 50 && scheduledProcess(); i += 1) await delay(100);
    }
  } else {
    const background = spawn(electronExecutable, [...args, '--tidy-scheduled-run'], { env, stdio: 'inherit', timeout: 15000 });
    assert.deepEqual(await once(background, 'exit'), [0, null]);
  }
  assert.equal(await fs.readFile(scheduledFile, 'utf8'), 'Scheduled file fixture');

  app = await launch();
  page = await app.firstWindow();
  await page.locator('#main-content').waitFor();
  await page.getByRole('heading', { name: 'Filed reports' }).waitFor();
  if (!service) {
    await page.getByRole('radio', { name: 'Daily', checked: true }).waitFor();
    assert.equal(await page.getByLabel('Schedule time').inputValue(), '03:14');
  }
  const summary = await page.evaluate(() => window.electron.getScheduledRunSummary());
  assert.equal(summary?.moved, 1);
  await page.keyboard.press('Meta+Alt+z');
  await page.getByText('Reversed 1 operations.', { exact: true }).waitFor({ timeout: 10000 });
  assert.equal(await fs.readFile(path.join(source, 'report.txt'), 'utf8'), 'Scheduled file fixture');
  assert.equal((await page.evaluate(() => window.electron.getScheduledRunSummary())).operations.length, 0);
  console.log('PASS schedule moves files after Tidy quits and exposes persisted Undo when reopened');
  if (!service && process.platform === 'darwin') {
    await page.getByRole('button', { name: 'OK', exact: true }).click();
    await app.evaluate(({ Notification }) => {
      Notification.prototype.show = function () {
        globalThis.tidyTestNotification = this;
        this.emit('show');
      };
    });
    const trigger = spawn(electronExecutable, [...args, '--tidy-scheduled-run'], { env, timeout: 15000 });
    assert.deepEqual(await once(trigger, 'exit'), [0, null]);
    let notification;
    for (let i = 0; i < 50; i += 1) {
      notification = await app.evaluate(() => {
        const item = globalThis.tidyTestNotification;
        return item && { id: item.id, actions: item.actions };
      });
      if (notification) break;
      await delay(100);
    }
    assert.match(notification?.id ?? '', /^tidy-undo-/);
    assert.equal(notification.actions[0].text, 'Undo');
    await app.evaluate(() => globalThis.tidyTestNotification.emit('action', {}, 0, -1));
    await page.getByText('Reversed 1 operation(s).', { exact: true }).waitFor();
    assert.equal(await fs.readFile(path.join(source, 'report.txt'), 'utf8'), 'Scheduled file fixture');
    await page.getByRole('button', { name: 'OK', exact: true }).click();
    console.log('PASS scheduled notification offers Undo and its action restores the recorded run');

    await page.getByRole('radio', { name: 'Manual' }).click();
    await page.getByRole('switch', { name: 'Watch for new files' }).click();
    for (let i = 0; i < 50; i += 1) {
      config = JSON.parse(await fs.readFile(configPath, 'utf8').catch(() => 'null'));
      if (config?.watchEnabled) break;
      await delay(100);
    }
    assert.equal(config?.watchEnabled, true);
    await delay(750);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
    const arrival = path.join(dest, 'Filed reports', 'arrival.txt');
    await fs.writeFile(path.join(source, 'arrival.txt'), 'Watched arrival fixture');
    for (let i = 0; i < 420; i += 1) {
      if (await fs.stat(arrival).catch(() => null)) break;
      await delay(100);
    }
    assert.equal(await fs.readFile(arrival, 'utf8'), 'Watched arrival fixture');
    assert.equal(await fs.readFile(path.join(source, 'report.txt'), 'utf8'), 'Scheduled file fixture');
    await app.evaluate(({ app }) => app.emit('activate'));
    page = await app.firstWindow();
    await page.locator('#main-content').waitFor();
    assert.equal((await page.evaluate(() => window.electron.getScheduledRunSummary())).moved, 1);
    console.log('PASS opt-in folder watching keeps organizing new arrivals after the window closes');
  }
} finally {
  if (app) await app.close();
  if (service) {
    try { launchctl('bootout', service); }
    catch { /* Reopening with a manual schedule may already have unloaded it. */ }
    const processId = scheduledProcess();
    if (processId) process.kill(Number(processId), 'SIGTERM');
  }
}
