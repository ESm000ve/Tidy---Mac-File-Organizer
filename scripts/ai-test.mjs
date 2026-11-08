import { _electron as electron } from 'playwright';
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
dotenv.config({quiet:true});
if (!process.env.GEMINI_API_KEY?.trim()) { console.log('SKIP: AI key is not configured.'); process.exit(0); }
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'tidy-ai-profile-'));
const env={...process.env,GEMINI_API_KEY:''}; delete env.ELECTRON_RUN_AS_NODE;
const executablePath=process.env.TIDY_EXECUTABLE;
const launch=()=>electron.launch({executablePath,args:[...(executablePath?[]:['.']),`--user-data-dir=${profile}`],env,timeout:60000});
let app;
try {
 app = await launch();
 let page=await app.firstWindow(); await page.locator('#main-content').waitFor();
 const source=path.join(profile,'synthetic-files');await fs.mkdir(source);const fixture=path.join(source,'Document1.txt');await fs.writeFile(fixture,'Family picnic shopping list: apples, bread, cheese, water. This is a synthetic test document.');const modified=new Date(2022,2,4,12);await fs.utimes(fixture,modified,modified);
 const local=await page.evaluate(source=>window.electron.getFolderPreview(source,[{id:'documents',name:'Documents',enabled:true,extensions:['txt'],subfolders:false}],true,{dateModified:'any',fileSize:'any',excludeHidden:false},'date-first'),source);
 assert.equal(local[0]?.smartRename?.source,'local');
 // Save through the real Settings UI, then relaunch with no environment key.
 await page.keyboard.press('Meta+,');
 await page.getByLabel('Gemini API key',{exact:true}).fill(process.env.GEMINI_API_KEY.trim());
 await page.getByRole('button',{name:'Save key',exact:true}).click();
 await page.getByText('Key saved securely. Use Test connection to verify it.',{exact:true}).waitFor();
 await app.close();
 app = undefined;
 app = await launch();
 page = await app.firstWindow();
 await page.locator('#main-content').waitFor();
 const status=await page.evaluate(()=>window.electron.getApiKeyStatus());
 assert.ok(status.saved && !status.environment,'Saved key did not survive an independent restart');
 await page.keyboard.press('Meta+,');await page.getByRole('button',{name:'Test connection',exact:true}).click();
 await page.getByText('Connected to Gemini. Your API key works.',{exact:true}).waitFor({timeout:40000});
 await page.getByRole('button',{name:'Close settings',exact:true}).click();
 const deadline=async(promise)=>{let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Synthetic AI test timed out')),45000);})]);}finally{clearTimeout(timer);}};
 // Only synthetic categories and a generic rule. No file contents or local paths.
 const result=await deadline(page.evaluate(()=>window.electron.parseRule('Create a category named Invoices for PDF files. Do not execute.',{categories:[]})));
 assert.ok(result.success && result.data?.newCategories?.some(category=>category.name==='Invoices'&&category.extensions?.includes('pdf')),'Synthetic structured rule parsing failed');
 const clarified=await deadline(page.evaluate(()=>window.electron.parseRule('Organize old PDFs',{categories:[{id:'documents',name:'Documents',enabled:true,extensions:['pdf','txt'],subfolders:false}],clarifications:[{question:'Which date range should I use?',answer:'Use files modified within the past month. Keep the current source and destination. Only update the rules, do not run.'}]})));
 assert.ok(clarified.success && clarified.data?.updateFilters?.dateModified==='month' && !clarified.data.clarification,'Synthetic clarification was not resolved to a supported date filter');
 const older=await deadline(page.evaluate(()=>window.electron.parseRule('Set the filters to PDFs older than 45 days. Only update the rules, do not run.',{categories:[{id:'documents',name:'Documents',enabled:true,extensions:['pdf'],subfolders:false}]})));
 assert.equal(older.success,true,older.error);
 assert.equal(older.data?.updateFilters?.dateModified,'older');
 assert.equal(older.data?.updateFilters?.olderThanDays,45);
 const chosenName='Family picnic shopping list.txt';
 await fs.writeFile(path.join(source,chosenName),'Family picnic shopping list: apples, bread, cheese, water. This is a synthetic test document.');
 const renamed=await deadline(page.evaluate(source=>window.electron.getFolderPreview(source,[{id:'documents',name:'Documents',enabled:true,extensions:['txt'],subfolders:false,smartCategorization:true}],true,{dateModified:'any',fileSize:'any',excludeHidden:false},'date-first'),source));
 const generic=renamed.find(file=>file.name==='Document1.txt');
 assert.ok(generic?.smartRename?.source==='ai','Synthetic rename used fallback instead of the AI service');assert.match(generic.smartRename.suggested,/^2022-03-04_.+\.txt$/);
 assert.ok(generic.smartRename.subfolder,'Live content sorting returned no semantic folder');
 const chosen=renamed.find(file=>file.name===chosenName);
 assert.equal(chosen?.smartRename?.source,'ai');
 assert.equal(chosen.smartRename.suggested,chosenName);
 assert.ok(chosen.smartRename.subfolder,'Keeping a name still permits Smart Sort');
 const proposed=await deadline(page.evaluate(source=>window.electron.suggestFolderRules(source,{}),source));
 assert.equal(proposed.success,true,proposed.error);
 assert.equal(proposed.sampleCount,2);
 assert.deepEqual(proposed.data.newCategories.flatMap(category=>category.extensions),['txt']);
 await page.evaluate(()=>window.electron.saveApiKey('SyntheticInvalidKeyForFailureTest1234567890'));
 const rejected=await deadline(page.evaluate(()=>window.electron.testApiKey()));
 assert.equal(rejected.success,false);
 assert.ok(rejected.error && !rejected.error.includes('SyntheticInvalidKey'));
 await page.evaluate(()=>window.electron.removeApiKey());
 console.log('PASS live Gemini connection, structured rules and renames, older-than cutoff, filename-only folder suggestions, and preserving a descriptive filename. Only synthetic data was sent.');
} catch {
 console.log('FAIL synthetic AI integration check; provider details and credentials are not printed.');process.exitCode=1;
} finally {
 try {
  await app?.close();
 } finally {
  await fs.rm(profile, { recursive: true, force: true });
 }
}
