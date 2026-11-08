import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
const artifacts=path.resolve('.test-artifacts'); await fs.mkdir(artifacts,{recursive:true});
const root=await fs.mkdtemp(path.join(artifacts,'desktop-'));
const source=path.join(root,'source'); const dest=path.join(root,'destination');
await fs.mkdir(source); await fs.mkdir(dest); await fs.writeFile(path.join(source,'report.txt'),'Sample file organizing test');
const env={...process.env,GEMINI_API_KEY:''}; delete env.ELECTRON_RUN_AS_NODE;
const executablePath=process.env.TIDY_EXECUTABLE;
const launch=()=>electron.launch({executablePath,args:[...(executablePath?[]:['.']),`--user-data-dir=${path.join(root,'profile')}`],env,timeout:60000});
let app=await launch();
const errors=[];
try {
 let page=await app.firstWindow(); page.on('pageerror',e=>errors.push(e.message));
 await page.locator('#main-content').waitFor();
 await page.waitForTimeout(500);
 assert.equal(await page.evaluate(()=>typeof window.electron?.organizeFiles),'function');
 await page.screenshot({path:path.join(artifacts,'macos-light.png')});
 await page.keyboard.press('Meta+,');
 await page.getByRole('dialog').waitFor();
 assert.match(await page.getByRole('dialog').innerText(),/Settings/);
 await page.screenshot({path:path.join(artifacts,'macos-settings.png')});
 await page.getByRole('button',{name:'Theme selector',exact:false}).click();
 await page.getByRole('menuitemradio',{name:'Dark',exact:true}).click();
 await page.waitForTimeout(250);
 assert.equal(await app.evaluate(({nativeTheme})=>nativeTheme.themeSource),'dark');
 await page.getByRole('button',{name:'Close settings',exact:true}).click();
 await page.getByRole('dialog').waitFor({state:'hidden'});
 await page.waitForTimeout(250);
 await page.screenshot({path:path.join(artifacts,'macos-dark.png')});
 await page.locator('section[aria-label="Schedule and Conflict Resolution"]').scrollIntoViewIfNeeded();
 await page.getByRole('radio',{name:/^daily$/i}).click();

 await page.locator('input[type="time"]').fill('14:37');
 assert.equal(await page.locator('input[type="time"]').inputValue(),'14:37');
 await page.waitForTimeout(400);
 await page.screenshot({path:path.join(artifacts,'macos-schedule.png')});
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(800,600));
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth > innerWidth),false);
 await page.screenshot({path:path.join(artifacts,'macos-minimum.png')});
 await page.emulateMedia({forcedColors:'active',reducedMotion:'reduce'});
 await page.screenshot({path:path.join(artifacts,'macos-contrast.png')});
 const categories=[{id:'documents',name:'Documents',enabled:true,extensions:['txt'],subfolders:false,duplicateDetection:false}];
 const preview=await page.evaluate(async({source,categories})=>window.electron.getFolderPreview(source,categories,false),{source,categories});
 assert.equal(preview.length,1); assert.equal(preview[0].name,'report.txt');
 assert.equal(await page.evaluate(file=>window.electron.quickLook(file),path.join(root,'outside.txt')),false);
 if (process.platform === 'darwin') {
  assert.equal(await page.evaluate(file=>window.electron.quickLook(file),preview[0].path),true);
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].closeFilePreview());
 }
 await app.evaluate(({BrowserWindow})=>{
  const window=BrowserWindow.getAllWindows()[0];
  const progress=window.setProgressBar.bind(window);
  globalThis.tidyTestProgress=[];
  window.setProgressBar=(value)=>{globalThis.tidyTestProgress.push(value);progress(value);};
 });
 const books=[['novel.EPUB','epub'],['reader.mobi','mobi'],['kindle.azw3','azw3'],['comic.cbz','cbz'],['audio.m4b','m4b']];
 for(const [name] of books) await fs.writeFile(path.join(source,name),'Synthetic book');
 await page.emulateMedia({forcedColors:'none',reducedMotion:'reduce'});
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1280,900));
 await page.evaluate(({source,dest})=>{localStorage.setItem('tidy_source_path',source);localStorage.setItem('tidy_dest_path',dest);},{source,dest});await page.reload();
 await page.getByRole('button',{name:'Run Tidy',exact:true}).click();
 let previewDialog=page.getByRole('dialog',{name:'Preview Changes',exact:true});await previewDialog.waitFor();
 assert.equal(await page.getByRole('button',{name:/Keeping original|Move only/}).count(),0,'No inactive copy controls');
 for(const [name] of books) await previewDialog.getByText(name,{exact:true}).waitFor();
 for(let i=0;i<12;i++){await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>Boolean(document.activeElement?.closest('[role="dialog"]'))),true,'Focus stays inside preview');}
 await page.keyboard.press('Escape');await previewDialog.waitFor({state:'hidden'});
 await page.getByRole('button',{name:'Run Tidy',exact:true}).click();await previewDialog.waitFor();
 await page.getByRole('button',{name:'Confirm & Run',exact:true}).click();
 await page.getByRole('heading',{name:'Tidy Complete!',exact:true}).waitFor();
 const progress=await app.evaluate(()=>globalThis.tidyTestProgress);
 assert.ok(progress.some(value=>value>=0 && value<=1));
 assert.equal(progress.at(-1),-1);
 for(const [name,extension] of books) assert.equal(await fs.readFile(path.join(dest,'Books',extension,name),'utf8'),'Synthetic book');
 await page.getByRole('button',{name:'Undo Changes',exact:true}).click();
 await page.getByRole('heading',{name:'Undo Complete',exact:true}).waitFor();
 for(const [name] of books) {
  assert.equal(await fs.readFile(path.join(source,name),'utf8'),'Synthetic book');
  await fs.unlink(path.join(source,name));
 }
 console.log('PASS default Books rule previews, moves, and undoes EPUB, MOBI, AZW3, CBZ, and M4B');
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('tidy_metrics')).operations.length),0,'Successful Undo is persisted');
 await page.reload();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('tidy_metrics')).operations.length),0);
 const request={sourcePath:source,destPath:dest,categories,filters:{dateModified:'any',fileSize:'any',excludeHidden:true},conflictResolution:'rename'};
 const result=await page.evaluate(request=>window.electron.organizeFiles(request),request);
 assert.equal(result.moved,1); assert.equal(result.errors,0);
 assert.equal(await fs.readFile(path.join(dest,'Documents','report.txt'),'utf8'),'Sample file organizing test');
 const forged=await page.evaluate(operations=>window.electron.undoOrganize(operations),[
  {...result.operations[0],originalPath:path.join(source,'forged.txt')},
 ]);
 assert.equal(forged.success,false);
 await assert.rejects(fs.stat(path.join(source,'forged.txt')),{code:'ENOENT'});
 await app.close();
 app=await launch();
 page=await app.firstWindow();
 page.on('pageerror',e=>errors.push(e.message));
 await page.locator('#main-content').waitFor();
 previewDialog=page.getByRole('dialog',{name:'Preview Changes',exact:true});
 const undo=await page.evaluate(operations=>window.electron.undoOrganize(operations),result.operations);
 assert.equal(undo.reverted,1);
 assert.equal(await fs.readFile(path.join(source,'report.txt'),'utf8'),'Sample file organizing test');
 assert.equal((await page.evaluate(operations=>window.electron.undoOrganize(operations),result.operations)).success,false);
 const disabled=await page.evaluate(()=>window.electron.parseRule('Move PDFs',{categories:[]}));
 assert.equal(disabled.success,false);assert.match(disabled.error,/not configured/);
 // A local parser fixture verifies that immediate preview uses the new rules,
 // rather than the React state from before the AI response. No API is called.
 await fs.writeFile(path.join(source,'old.txt'),'Older synthetic file');await fs.utimes(path.join(source,'old.txt'),new Date('2020-01-01'),new Date('2020-01-01'));
 await app.evaluate(({ipcMain},{source,dest})=>{ipcMain.removeHandler('ai:parseRule');ipcMain.handle('ai:parseRule',(_event,_rule,context)=>({success:true,data:{sourcePath:source,destPath:dest,execute:true,smartRename:false,updateFilters:{dateModified:'week'},updateCategories:context.categories.map(category=>({id:category.id,enabled:false})),newCategories:[{name:'Family papers',extensions:['txt'],subfolders:false}]}}));},{source,dest});
 await page.locator('#nl-inline-input').fill('Organize family text documents from the past week');await page.getByRole('button',{name:'Review AI rule',exact:true}).click();
 const ruleReview=page.getByRole('dialog',{name:'Review AI rule',exact:true});await ruleReview.waitFor();
 assert.match(await ruleReview.innerText(),/past 7 days/);
 assert.equal(await page.locator('#toggle-documents-label').textContent(),'Documents');
 assert.equal(await previewDialog.count(),0,'No file preview before confirmation');
 assert.equal(await page.locator('main').getByRole('heading',{name:'Family papers',exact:true}).count(),0,'Rules stay unchanged until accepted');
 await ruleReview.getByRole('button',{name:'Cancel',exact:true}).click();await ruleReview.waitFor({state:'hidden'});
 assert.equal(await page.locator('main').getByRole('heading',{name:'Family papers',exact:true}).count(),0,'Cancel preserves settings');
 await page.getByRole('button',{name:'Review AI rule',exact:true}).click();await ruleReview.waitFor();await ruleReview.getByRole('button',{name:'Apply and preview',exact:true}).click();
 await previewDialog.waitFor();await page.getByText('report.txt',{exact:true}).first().waitFor();
 assert.equal(await page.getByText('old.txt',{exact:true}).count(),0,'New date filter is used immediately');
 assert.match(await previewDialog.innerText(),/family papers/i,'New custom category is visible');
 await page.keyboard.press('Escape');await previewDialog.waitFor({state:'hidden'});
 // Clarification uses the existing parser with a short question/answer context.
 await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('ai:parseRule');ipcMain.handle('ai:parseRule',(_event,_rule,context)=>context.clarifications?.length ? {success:true,data:{updateFilters:{dateModified:'month'},execute:false}} : {success:true,data:{clarification:'Which recent time period should I use?'}});});
 await page.locator('#nl-inline-input').fill('Organize old family documents');await page.getByRole('button',{name:'Review AI rule',exact:true}).click();
 const questionDialog=page.getByRole('dialog',{name:'One detail first',exact:true});await questionDialog.waitFor();
 assert.match(await questionDialog.innerText(),/Which date range/);assert.equal(await page.locator('#rule-clarification').evaluate(el=>el===document.activeElement),true);
 await page.locator('#rule-clarification').fill('Use files modified within the past month');await questionDialog.getByRole('button',{name:'Continue',exact:true}).click();await ruleReview.waitFor();
 assert.match(await ruleReview.innerText(),/past 30 days/);await ruleReview.getByRole('button',{name:'Cancel',exact:true}).click();await ruleReview.waitFor({state:'hidden'});
 assert.equal(await page.getByRole('combobox',{name:'Date modified',exact:true}).innerText(),'Past 7 days','Cancelling a clarified draft leaves the previous filter');
 await page.getByRole('button',{name:'Advanced editor',exact:true}).click();await page.locator('#rule-input').fill('Organize family documents');await page.getByRole('button',{name:'Review rule',exact:true}).click();await questionDialog.waitFor();assert.match(await questionDialog.innerText(),/Which recent time period/);
 await page.locator('#rule-clarification').fill('Within the past month');await questionDialog.getByRole('button',{name:'Continue',exact:true}).click();await ruleReview.waitFor();
 await ruleReview.getByRole('button',{name:'Apply rules',exact:true}).click();await ruleReview.waitFor({state:'hidden'});assert.equal(await previewDialog.count(),0,'Advanced editor only applies reviewed settings');
 assert.equal(await page.getByRole('combobox',{name:'Date modified',exact:true}).innerText(),'Past 30 days');
 await page.locator('#ai-smart-rename-chip').click();await page.getByRole('combobox',{name:'Naming style',exact:true}).click();await page.getByRole('option',{name:'Date first',exact:true}).click();
 assert.equal(await page.evaluate(()=>localStorage.getItem('tidy_naming_style')),'date-first');await page.reload();await page.locator('#ai-smart-rename-chip').click();assert.equal(await page.getByRole('combobox',{name:'Naming style',exact:true}).innerText(),'Date first');
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('PASS desktop workflows, persistent Undo, staged/cancelled/confirmed AI rules, clarification follow-ups, advanced editor review, and saved naming style');
} finally { await app.close(); }

