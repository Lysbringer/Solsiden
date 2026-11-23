const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {_electron}=require('playwright');
async function launch(directory){const env={...process.env,BOKMAL_TEST_USER_DATA:directory};delete env.ELECTRON_RUN_AS_NODE;const app=await _electron.launch({args:[path.resolve('tests/support/electron-harness.cjs')],env,timeout:20000});const page=await app.firstWindow();await page.getByRole('textbox',{name:'original paragraph',exact:true}).waitFor();return {app,page};}
async function type(editor,page,text,replace=false){await editor.click();if(replace)await page.keyboard.press('Control+a');await page.keyboard.type(text);assert((await editor.innerText()).includes(text));assert(await editor.evaluate(e=>e.contains(document.activeElement)));assert(await page.evaluate(()=>document.hasFocus()));}
async function save(page){await page.getByRole('button',{name:'Save',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.badge')?.textContent.includes('All changes saved'));}
async function saveAs(page,name){await page.getByRole('button',{name:'Save As',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Save As',exact:true});await dialog.getByLabel('Article name').fill(name);await page.screenshot({path:path.join(os.tmpdir(),'bokmal-save-as-dialog.png')});await dialog.getByRole('button',{name:'Save copy',exact:true}).click();await dialog.waitFor({state:'detached'});await page.locator('.library .selected').filter({hasText:name}).waitFor();return page.evaluate(()=>window.desktop.list());}

test('real Windows Electron Save As, restart persistence and immediate editor interaction', {skip:process.platform!=='win32',timeout:90000},async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'bokmal-electron-regression-'));let running=await launch(directory);
 try{
 let {app,page}=running;const errors=[];page.on('pageerror',error=>errors.push(error.message));
 assert(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isFocused()));assert(await page.evaluate(()=>document.hasFocus()));
 const draft=page.locator('.library-draft');await draft.waitFor();assert.match(await draft.innerText(),/Untitled article/);
 const original=()=>page.getByRole('textbox',{name:'original paragraph',exact:true}).first();const norwegian=()=>page.getByRole('textbox',{name:'translation paragraph',exact:true}).first();
 await type(page.getByRole('textbox',{name:'original headline',exact:true}),page,'Original headline',true);await type(original(),page,'Startup original');await type(norwegian(),page,'Startup norsk');assert.equal((await page.evaluate(()=>window.desktop.list())).length,0);
 await page.getByLabel('Search library').fill('no matching article');let records=await saveAs(page,'First copy');assert.equal(records.length,1);assert.equal(await page.getByLabel('Search library').inputValue(),'');const firstId=records[0].id;assert.equal(await draft.count(),0);
 await type(original(),page,' first-only');await save(page);records=await page.evaluate(()=>window.desktop.list());assert.equal(records.length,1);assert.equal(records[0].id,firstId);assert(records[0].paragraphs.some(p=>p.original.includes('first-only')));
 const originalSnapshot=structuredClone(records[0]);records=await saveAs(page,'Second copy');assert.equal(records.length,2);const second=records.find(p=>p.title==='Second copy');assert.notEqual(second.id,firstId);assert.deepEqual(records.find(p=>p.id===firstId),originalSnapshot);
 await type(norwegian(),page,' second-only');await save(page);records=await page.evaluate(()=>window.desktop.list());assert.deepEqual(records.find(p=>p.id===firstId),originalSnapshot);assert(records.find(p=>p.id===second.id).paragraphs.some(p=>p.translation.includes('second-only')));
 // Exercise the real IPC/store failure path without touching any real user data.
 fs.mkdirSync(path.join(directory,'projects.sqlite.tmp'));await page.getByRole('button',{name:'Save As',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Save As',exact:true});await dialog.getByLabel('Article name').fill('Should not persist');await dialog.getByRole('button',{name:'Save copy',exact:true}).click();await dialog.getByRole('alert').waitFor();assert((await dialog.getByRole('alert').innerText()).includes('Save failed'));assert.equal((await page.evaluate(()=>window.desktop.list())).length,2);await dialog.getByRole('button',{name:'Cancel',exact:true}).click();fs.rmdirSync(path.join(directory,'projects.sqlite.tmp'));
 await page.locator('.library .article').filter({hasText:'First copy'}).click();await type(original(),page,' switched-now');await save(page);
 await page.getByRole('button',{name:'New article'}).click();await draft.waitFor();assert.equal(await page.locator('.library .article').first().getAttribute('aria-current'),'true');await type(original(),page,'New unsaved article');await type(norwegian(),page,'New norsk');
 await page.getByRole('button',{name:'Save As',exact:true}).click();await page.getByRole('dialog',{name:'Save As',exact:true}).getByRole('button',{name:'Cancel',exact:true}).click();assert((await original().innerText()).includes('New unsaved article'));assert.equal((await page.evaluate(()=>window.desktop.list())).length,2);
 await page.locator('.library .article').filter({hasText:'Second copy'}).click();await page.getByRole('dialog',{name:'Discard unsaved changes?'}).getByRole('button',{name:'Cancel'}).click();assert((await original().innerText()).includes('New unsaved article'));
 await page.locator('.library .article').filter({hasText:'Second copy'}).click();await page.getByRole('button',{name:'Discard and switch'}).click();await draft.waitFor({state:'detached'});await type(original(),page,' after-discard');await save(page);
 // Keep extraction deterministic; only this test instance's extraction IPC is
 // replaced. The real BrowserWindow, preload, editor, save IPC and SQLite run.
 const extracted={title:'Accepted headline',url:'https://example.com/article',method:'http',warnings:[],blocks:[{id:'ex-head',kind:'headline',original:{text:[{text:'Accepted headline'}]},translation:{text:[]}},{id:'ex-body',kind:'paragraph',original:{text:[{text:'Accepted source paragraph'}]},translation:{text:[]}}]};
 await app.evaluate(({ipcMain},article)=>{ipcMain.removeHandler('article:extract');ipcMain.handle('article:extract',()=>article)},extracted);
 if(await page.getByRole('button',{name:'Article URL: show'}).count())await page.getByRole('button',{name:'Article URL: show'}).click();await page.locator('#url').fill(extracted.url);await page.getByRole('button',{name:'Load article',exact:true}).click();await page.getByRole('button',{name:'Load preview',exact:true}).click();await page.getByRole('dialog',{name:'Extraction preview'}).waitFor();await page.getByRole('button',{name:'Accept article',exact:true}).click();await page.getByRole('button',{name:'Discard and accept'}).click();await page.getByRole('dialog',{name:'Extraction preview'}).waitFor({state:'detached'});await type(original(),page,' immediate-after-acceptance');await type(norwegian(),page,'Norsk etter aksept');
 assert.equal(await page.locator('.overlay,.extraction-loading').count(),0);assert.equal(await page.locator('.editor-container').getAttribute('inert'),null);assert.equal(await page.locator('.article-cell .tiptap').count(),4);
 await page.keyboard.press('Control+a');await page.keyboard.press('ArrowRight');await page.keyboard.press('Shift+ArrowLeft');assert((await page.evaluate(()=>window.getSelection().toString())).length>0);
 await saveAs(page,'Accepted copy');const beforeRestart=await page.evaluate(()=>window.desktop.list());assert.equal(beforeRestart.length,3);await page.screenshot({path:path.join(os.tmpdir(),'bokmal-save-as-electron.png')});await app.close();running=undefined;
 running=await launch(directory);({app,page}=running);const afterRestart=await page.evaluate(()=>window.desktop.list());assert.deepEqual(afterRestart.sort((a,b)=>a.id.localeCompare(b.id)),beforeRestart.sort((a,b)=>a.id.localeCompare(b.id)));
 await page.locator('.library .article').filter({hasText:'Second copy'}).click();await type(original(),page,' restart-edit');await save(page);const final=await page.evaluate(()=>window.desktop.list());assert.equal(final.length,3);assert(final.find(p=>p.id===second.id).paragraphs.some(p=>p.original.includes('restart-edit')));assert(!final.find(p=>p.id===firstId).paragraphs.some(p=>p.original.includes('restart-edit')));assert.equal(errors.length,0);
 console.log('Actual Electron Windows verification passed; no window blur/refocus was used. Temporary library:',directory);
 }finally{if(running){const appProcess=running.app.process();const exited=appProcess.exitCode===null?new Promise(resolve=>appProcess.once('exit',resolve)):Promise.resolve();await running.app.evaluate(({app})=>app.exit(0)).catch(()=>{});await exited;await running.app.close().catch(()=>{});}assert.equal(path.dirname(path.resolve(directory)),path.resolve(os.tmpdir()));fs.rmSync(directory,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
});

test('real Windows Electron deletion confirms, protects dirty work, isolates copies and survives restart',{skip:process.platform!=='win32',timeout:90000},async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'bokmal-delete-regression-'));let running=await launch(directory);
 try{let {app,page}=running;await type(page.getByRole('textbox',{name:'original paragraph',exact:true}),page,'Retain source and shared image references');let records=await saveAs(page,'Original for deletion test');const original=structuredClone(records[0]);records=await saveAs(page,'Disposable copy');const copy=records.find(p=>p.title==='Disposable copy');await page.evaluate(p=>window.desktop.save({...p,id:'background-article',title:'Background article'}),original);await save(page);await type(page.getByRole('textbox',{name:'translation paragraph',exact:true}),page,'Unsaved norsk');
 await page.getByRole('button',{name:'Delete Original for deletion test',exact:true}).click();let dialog=page.getByRole('dialog',{name:'Delete article?',exact:true});assert((await dialog.innerText()).includes(original.title));assert.equal(await dialog.locator('.delete-warning').count(),0);await dialog.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal((await page.evaluate(()=>window.desktop.list())).length,3);
 await page.getByRole('button',{name:'Delete Background article',exact:true}).click();await page.getByRole('dialog',{name:'Delete article?',exact:true}).getByRole('button',{name:'Delete article',exact:true}).click();await page.getByRole('dialog',{name:'Delete article?',exact:true}).waitFor({state:'detached'});assert((await page.getByRole('textbox',{name:'translation paragraph',exact:true}).innerText()).includes('Unsaved norsk'));assert((await page.locator('.badge').innerText()).includes('Unsaved changes'));
 await page.getByRole('button',{name:'Delete Disposable copy',exact:true}).click();dialog=page.getByRole('dialog',{name:'Delete article?',exact:true});await dialog.locator('.delete-warning').waitFor();await page.screenshot({path:path.join(os.tmpdir(),'bokmal-delete-confirmation.png')});await dialog.getByRole('button',{name:'Cancel',exact:true}).click();assert((await page.getByRole('textbox',{name:'translation paragraph',exact:true}).innerText()).includes('Unsaved norsk'));
 fs.mkdirSync(path.join(directory,'projects.sqlite.tmp'));await page.getByRole('button',{name:'Delete Disposable copy',exact:true}).click();dialog=page.getByRole('dialog',{name:'Delete article?',exact:true});await dialog.getByRole('button',{name:'Delete article',exact:true}).click();await dialog.getByRole('alert').waitFor();assert((await dialog.getByRole('alert').innerText()).includes('Deletion failed'));assert.equal((await page.evaluate(()=>window.desktop.list())).length,2);assert((await page.getByRole('textbox',{name:'translation paragraph',exact:true}).innerText()).includes('Unsaved norsk'));fs.rmdirSync(path.join(directory,'projects.sqlite.tmp'));
 await dialog.getByRole('button',{name:'Delete article',exact:true}).click();await dialog.waitFor({state:'detached'});await page.waitForFunction(()=>document.querySelectorAll('.library .article').length===1);assert.equal((await page.getByRole('textbox',{name:'original paragraph',exact:true}).innerText()).trim(),'');assert.equal((await page.getByRole('textbox',{name:'translation paragraph',exact:true}).innerText()).trim(),'');assert((await page.locator('.badge').innerText()).includes('All changes saved'));assert.deepEqual(await page.evaluate(()=>window.desktop.list()),[original]);assert.equal(await page.locator('.library .selected').count(),0);await app.close();running=undefined;
 running=await launch(directory);({app,page}=running);assert.deepEqual(await page.evaluate(()=>window.desktop.list()),[original]);assert.equal(await page.getByRole('button',{name:'Delete Disposable copy',exact:true}).count(),0);await page.getByRole('button',{name:'Delete Original for deletion test',exact:true}).click();await page.getByRole('dialog',{name:'Delete article?',exact:true}).getByRole('button',{name:'Delete article',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.library .article').length===0);assert.equal((await page.evaluate(()=>window.desktop.list())).length,0);
 console.log('Real Electron delete/cancel/error/restart checks passed.');
 }finally{if(running){const child=running.app.process();const exited=child.exitCode===null?new Promise(resolve=>child.once('exit',resolve)):Promise.resolve();await running.app.evaluate(({app})=>app.exit(0)).catch(()=>{});await exited;await running.app.close().catch(()=>{});}assert.equal(path.dirname(path.resolve(directory)),path.resolve(os.tmpdir()));fs.rmSync(directory,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
});

test('real Windows Electron multi-selection, atomic bulk delete and restart',{skip:process.platform!=='win32',timeout:90000},async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'bokmal-bulk-regression-'));let running=await launch(directory);
 try{let {app,page}=running;await page.evaluate(async()=>{for(let i=1;i<=5;i++)await window.desktop.save({id:'bulk-'+i,title:'Bulk article '+i,url:'',updatedAt:'',paragraphs:[{id:'p'+i,original:'Article body '+i,translation:''}]})});await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.library input[type=checkbox]').length===5);const articles=page.locator('.library .article'),boxes=page.locator('.library input[type=checkbox]'),library=page.getByRole('region',{name:'Article library',exact:true});const titles=await articles.locator('strong').allTextContents();
 await articles.nth(0).click();await articles.nth(4).click({modifiers:['Control']});assert.equal(await boxes.evaluateAll(es=>es.filter(e=>e.checked).length),1);assert((await page.locator('.library [aria-current=true] strong').innerText())===titles[0]);await articles.nth(1).click({modifiers:['Shift']});assert.equal(await boxes.evaluateAll(es=>es.filter(e=>e.checked).length),4);await articles.nth(2).click({modifiers:['Control']});assert.equal(await boxes.evaluateAll(es=>es.filter(e=>e.checked).length),3);await boxes.nth(0).check();assert.equal(await boxes.evaluateAll(es=>es.filter(e=>e.checked).length),4);
 await library.focus();await page.keyboard.press('Escape');assert.equal(await boxes.evaluateAll(es=>es.filter(e=>e.checked).length),0);await boxes.nth(1).check();await boxes.nth(3).click({modifiers:['Shift']});assert.equal(await boxes.evaluateAll(es=>es.filter(e=>e.checked).length),3);await library.focus();await page.keyboard.press('Escape');await page.keyboard.press('Control+a');assert.equal(await boxes.evaluateAll(es=>es.filter(e=>e.checked).length),5);await page.getByRole('button',{name:'Delete selected',exact:true}).click();let dialog=page.getByRole('dialog',{name:'Delete selected articles?',exact:true});assert((await dialog.innerText()).includes('5 selected articles'));await dialog.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal((await page.evaluate(()=>window.desktop.list())).length,5);assert.equal(await boxes.evaluateAll(es=>es.filter(e=>e.checked).length),5);
 await library.focus();await page.keyboard.press('Escape');const editor=page.getByRole('textbox',{name:'original paragraph',exact:true});await editor.click();await page.keyboard.press('Control+a');assert((await page.evaluate(()=>window.getSelection().toString())).length>0);assert.equal(await boxes.evaluateAll(es=>es.filter(e=>e.checked).length),0);await page.keyboard.press('ArrowRight');await page.keyboard.type(' unsaved marker');await boxes.nth(0).check();await boxes.nth(1).check();const before=await page.evaluate(()=>window.desktop.list());
 fs.mkdirSync(path.join(directory,'projects.sqlite.tmp'));await page.getByRole('button',{name:'Delete selected',exact:true}).click();dialog=page.getByRole('dialog',{name:'Delete selected articles?',exact:true});await dialog.locator('.delete-warning').waitFor();await page.screenshot({path:path.join(os.tmpdir(),'bokmal-bulk-delete.png')});await dialog.getByRole('button',{name:'Delete 2 articles',exact:true}).click();await dialog.getByRole('alert').waitFor();assert.deepEqual(await page.evaluate(()=>window.desktop.list()),before);assert((await editor.innerText()).includes('unsaved marker'));fs.rmdirSync(path.join(directory,'projects.sqlite.tmp'));await dialog.getByRole('button',{name:'Delete 2 articles',exact:true}).click();await dialog.waitFor({state:'detached'});await page.waitForFunction(()=>document.querySelectorAll('.library .article').length===3);assert.equal(await boxes.evaluateAll(es=>es.filter(e=>e.checked).length),0);assert.equal(await page.getByRole('button',{name:'Delete selected',exact:true}).count(),0);assert.equal((await editor.innerText()).trim(),'');const kept=await page.evaluate(()=>window.desktop.list());assert.equal(kept.length,3);assert.deepEqual(kept,before.filter(p=>titles.slice(2).includes(p.title)));await app.close();running=undefined;running=await launch(directory);({app,page}=running);assert.deepEqual(await page.evaluate(()=>window.desktop.list()),kept);assert.equal(await page.locator('.library .article').count(),3);
 }finally{if(running){const child=running.app.process();const exited=child.exitCode===null?new Promise(resolve=>child.once('exit',resolve)):Promise.resolve();await running.app.evaluate(({app})=>app.exit(0)).catch(()=>{});await exited;await running.app.close().catch(()=>{});}assert.equal(path.dirname(path.resolve(directory)),path.resolve(os.tmpdir()));fs.rmSync(directory,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
});

test('Windows Electron translation fills the draft and preserves existing edits', {
 skip: process.platform !== 'win32',
 timeout: 60000,
}, async () => {
 const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bokmal-translation-'));
 const env = { ...process.env, BOKMAL_TEST_USER_DATA: directory };
 delete env.ELECTRON_RUN_AS_NODE;
 let app;
 try {
  app = await _electron.launch({ args: [path.resolve('tests/support/electron-harness.cjs')], env });
  const page = await app.firstWindow();
  assert.equal(await page.title(), 'Solside oversettelse');
  assert.equal(await app.evaluate(({ app }) => app.getPath('userData')), directory);
  await page.waitForFunction(() => document.querySelector('img.brand')?.naturalWidth > 0);
  const translate = page.getByRole('button', { name: 'Translate via API' });
  await page.getByRole('textbox', { name: 'original headline' }).fill('News headline');
  await page.getByRole('textbox', { name: 'original paragraph' }).fill('A paragraph');
  const existing = page.getByRole('textbox', { name: 'translation headline' });
  await existing.fill('Min overskrift');
  await translate.click();
  await page.getByText('Save an OpenAI API key', { exact: false }).waitFor();
  await app.evaluate(({ ipcMain }) => {
   ipcMain.removeHandler('article:translate');
   ipcMain.handle('article:translate', (_event, rows) => {
    if (JSON.stringify(rows) !== JSON.stringify([['A paragraph']])) throw new Error('Unexpected source');
    return [['Et avsnitt']];
   });
  });
  await translate.click();
  await page.getByText('Bokmål draft ready.', { exact: false }).waitFor();
  const paragraph = page.getByRole('textbox', { name: 'translation paragraph' });
  assert.equal(await paragraph.innerText(), 'Et avsnitt');
  assert.equal(await existing.innerText(), 'Min overskrift');
  assert.equal((await page.evaluate(() => window.desktop.list())).length, 0);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByText('All changes saved', { exact: false }).waitFor();
  const [saved] = await page.evaluate(() => window.desktop.list());
  assert(saved.paragraphs.some(row => row.original === 'A paragraph' && row.translation === 'Et avsnitt'));

  await page.getByRole('button', { name: 'New article' }).click();
  await page.getByRole('textbox', { name: 'original headline' }).fill('Another headline');
  await page.getByRole('textbox', { name: 'original paragraph' }).fill('Another paragraph');
  await existing.fill('Egen overskrift');
  await page.getByRole('button', { name: 'Translate with ChatGPT' }).click();
  const dialog = page.getByRole('dialog', { name: 'Translate with ChatGPT' });
  const prompt = await dialog.getByLabel('ChatGPT prompt').inputValue();
  const { requestId, source } = JSON.parse(prompt.split('\n\n').at(-1));
  assert.deepEqual(source, [['Another paragraph']]);
  const reply = dialog.getByLabel('ChatGPT reply');
  const importButton = dialog.getByRole('button', { name: 'Import translation' });
  await reply.fill(JSON.stringify({ requestId: 'another-request', translations: [['Et annet avsnitt']] }));
  await importButton.click();
  await dialog.getByRole('alert').filter({ hasText: 'does not match' }).waitFor();
  await reply.fill(JSON.stringify({ requestId, translations: [] }).slice(0, -1));
  await importButton.click();
  await dialog.getByRole('alert').filter({ hasText: 'This prompt expects 1' }).waitFor();
  await reply.fill('```json\n' + JSON.stringify({ requestId, translations: [['Et annet avsnitt']] }).slice(0, -2));
  await importButton.click();
  await dialog.waitFor({ state: 'detached' });
  assert.equal(await paragraph.innerText(), 'Et annet avsnitt');
  assert.equal(await existing.innerText(), 'Egen overskrift');
  assert.equal((await page.evaluate(() => window.desktop.list())).length, 1);
  await page.evaluate(() => window.desktop.configure('OpenAI', 'test-openai-key'));
  await page.getByRole('button', { name: 'Settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByLabel('Provider').selectOption('DeepL');
  await settings.getByLabel('API key').fill('test-deepl-key');
  await settings.getByRole('button', { name: 'Save settings' }).click();
  const deepL = page.getByRole('button', { name: 'Translate with DeepL' });
  assert.deepEqual((await page.evaluate(() => window.desktop.settings())).configuredProviders.sort(), ['DeepL', 'OpenAI']);
  await page.getByRole('button', { name: 'Add aligned paragraph' }).click();
  await page.getByRole('textbox', { name: 'original paragraph' }).last().fill('A new block');
  await app.evaluate(({ ipcMain }) => {
   ipcMain.removeHandler('article:translate-deepl');
   ipcMain.handle('article:translate-deepl', (_event, rows) => {
    if (JSON.stringify(rows) !== JSON.stringify([[{ text: 'A new block' }]])) throw new Error('Unexpected DeepL input');
    return [[{ text: 'Et nytt avsnitt', marks: ['bold'] }]];
   });
  });
  await deepL.click();
  const newTranslation = paragraph.last();
  await newTranslation.getByText('Et nytt avsnitt').waitFor();
  assert.equal(await newTranslation.locator('strong').innerText(), 'Et nytt avsnitt');
  assert.equal(await paragraph.first().innerText(), 'Et annet avsnitt');
  await app.evaluate(({ ipcMain }) => {
   ipcMain.removeHandler('article:suggest-deepl-headline');
   ipcMain.handle('article:suggest-deepl-headline', (_event, { headline, context }) => {
    if (headline.map(span => span.text).join('') !== 'Another headline' || context !== 'Another paragraph\n\nA new block') {
     throw new Error('Unexpected contextual headline input');
    }
    return [{ text: 'En kontekstuell overskrift' }];
   });
  });
  const suggestHeadline = page.getByRole('button', { name: 'Suggest contextual headline' });
  const suggestedHeadline = page.getByRole('region', { name: 'Suggested Bokmål headline' });
  await suggestHeadline.click();
  await suggestedHeadline.getByText('En kontekstuell overskrift').waitFor({ timeout: 5000 });
  assert.equal(await existing.innerText(), 'Egen overskrift');
  await suggestedHeadline.getByRole('button', { name: 'Decline' }).click();
  assert.equal(await existing.innerText(), 'Egen overskrift');
  await suggestHeadline.click();
  await suggestedHeadline.getByRole('button', { name: 'Use suggested headline' }).click();
  assert.equal(await existing.innerText(), 'En kontekstuell overskrift');
  assert.equal((await page.evaluate(() => window.desktop.list())).length, 1);
  await app.evaluate(({ session }) => {
   session.fromPartition('bokmal-deepl-panel').protocol.handle('https', () =>
    new Response('<title>DeepL test translator</title><header>Site header</header><div data-testid="translator"><main><nav>Modes</nav><textarea data-testid="translator-source-input"></textarea><textarea data-testid="translator-target-input"></textarea><div id="dictionary"><div><h3 id="dictionary-header">Dictionary</h3></div></div><aside data-testid="side-panel-collapsable-wrapper">Right toolbar</aside><button data-testid="side-panel-expand-button">Expand</button></main><aside id="marketing">Marketing</aside></div><footer>Site footer</footer>', { headers: { 'Content-Type': 'text/html' } }));
  });
  const row = page.locator('.aligned-row').filter({ has: page.getByRole('textbox', { name: 'translation paragraph' }) }).last();
  const openDeepL = row.locator('.deepl-row-trigger');
  assert.equal(await openDeepL.isVisible(), false);
  await row.getByRole('textbox', { name: 'original paragraph' }).click();
  assert.equal(await openDeepL.isVisible(), true);
  await newTranslation.click();
  assert.equal(await openDeepL.isVisible(), true);
  const rowBounds = await row.boundingBox();
  const barBounds = await openDeepL.boundingBox();
  assert(Math.abs(rowBounds.width - barBounds.width) <= 1);
  assert(Math.abs(rowBounds.y + rowBounds.height - barBounds.y - barBounds.height) <= 1);
  await openDeepL.click({ position: { x: barBounds.width - 12, y: 12 } });
  const workspace = page.locator('.article-editor');
  const translator = workspace.getByRole('region', { name: 'DeepL Translator' });
  const activePane = workspace.getByRole('region', { name: 'Active paragraph' });
  await workspace.locator('.deepl-row-panel[aria-busy="false"]').waitFor();
  assert.equal(await translator.getByRole('status').count(), 0);
  assert.equal(await activePane.locator('.aligned-row:visible').count(), 1);
  assert.equal(await activePane.getByRole('textbox').count(), 2);
  const top = await activePane.boundingBox();
  const panel = await translator.boundingBox();
  assert(Math.abs(panel.x - top.x) <= 1);
  assert(Math.abs(panel.width - top.width) <= 1);
  assert(panel.y >= Math.floor(top.y + top.height));
  const native = await app.evaluate(({ BrowserWindow, webContents }) => ({
   windows: BrowserWindow.getAllWindows().length,
   bounds: BrowserWindow.getAllWindows()[0].contentView.children.at(-1).getBounds(),
   url: webContents.getAllWebContents().find(contents => contents.getURL().startsWith('https://www.deepl.com/'))?.getURL(),
  }));
  assert.equal(native.windows, 1);
  assert.equal(native.url, 'https://www.deepl.com/en/translator#en/nb/');
  assert(native.bounds.width >= Math.floor(panel.width) - 2);
  const layout = await app.evaluate(async ({ webContents }) => {
   const embedded = webContents.getAllWebContents().find(contents => contents.getURL().startsWith('https://www.deepl.com/'));
   embedded.focus();
   if (await embedded.executeJavaScript('document.querySelector(\'[data-testid="translator-source-input"]\').value') !== 'A new block') {
    throw new Error('Expected the matching English paragraph in DeepL');
   }
   if (Math.abs(embedded.getZoomFactor() - 0.85) > 0.01) throw new Error('Expected the DeepL popup to use 85% zoom');
   if (await embedded.executeJavaScript('getComputedStyle(document.documentElement).overflowY') !== 'scroll') {
    throw new Error('Expected an independent DeepL scrollbar');
   }
   return embedded.executeJavaScript(`['header', 'footer', '#marketing', 'main > nav', '#dictionary', '[data-testid="side-panel-collapsable-wrapper"]', '[data-testid="side-panel-expand-button"]', '[data-testid="translator-source-input"]', '[data-testid="translator-target-input"]']
    .map(selector => getComputedStyle(document.querySelector(selector)).display === 'none')`);
  });
  assert.deepEqual(layout, [true, true, true, true, true, true, true, false, false]);
  const divider = workspace.getByRole('separator', { name: 'Resize article and DeepL panes' });
  const grip = await divider.boundingBox();
  const x = grip.x + grip.width / 2;
  const y = grip.y + grip.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 65, { steps: 5 });
  await page.mouse.up();
  assert((await activePane.boundingBox()).height > top.height + 40);
  assert((await translator.boundingBox()).height < panel.height - 40);
  await page.addStyleTag({ content: '.deepl-active-row > .article-cell { min-height: 600px; }' });
  const sourceScroll = await activePane.evaluate(element => {
   element.scrollTop = 50;
   return element.scrollTop;
  });
  assert.equal(sourceScroll, 50);
  const deepLScroll = await app.evaluate(({ webContents }) => {
   const embedded = webContents.getAllWebContents().find(contents => contents.getURL().startsWith('https://www.deepl.com/'));
   return embedded.executeJavaScript(`document.querySelector('main').style.minHeight = '1000px';
    window.scrollTo(0, 80);
    ({ scroll: window.scrollY, wheelAllowed: document.querySelector('textarea').dispatchEvent(
     new WheelEvent('wheel', { deltaY: 80, bubbles: true, cancelable: true })) })`);
  });
  assert(deepLScroll.scroll > 0);
  assert.equal(deepLScroll.wheelAllowed, true);
  assert.equal(await activePane.evaluate(element => element.scrollTop), sourceScroll);
  const closeDeepL = translator.getByRole('button', { name: 'Close DeepL' });
  const closeBounds = await closeDeepL.boundingBox();
  assert(closeBounds.width >= panel.width - 2);
  await closeDeepL.click({ position: { x: 12, y: 12 } });
  await translator.waitFor({ state: 'detached' });
  assert.equal(await app.evaluate(({ webContents }) => webContents.getAllWebContents().some(contents => contents.getURL().startsWith('https://www.deepl.com/'))), false);
  assert.equal(await newTranslation.innerText(), 'Et nytt avsnitt');
  assert(await paragraph.first().isVisible());
  await type(newTranslation, page, 'Direkte redigering', true);
  await openDeepL.click();
  await workspace.locator('.deepl-row-panel[aria-busy="false"]').waitFor();
  await app.evaluate(({ webContents, clipboard }) => {
   const embedded = webContents.getAllWebContents().find(contents => contents.getURL().startsWith('https://www.deepl.com/'));
   clipboard.write = data => { globalThis.copiedBokmal = data; };
   return embedded.executeJavaScript(`document.querySelector('[data-testid="translator-target-input"]').value = 'Revidert norsk tekst.'`);
  });
  const useTranslation = translator.getByRole('button', { name: 'Use this translation' });
  await useTranslation.click();
  const translationPreview = page.getByRole('dialog', { name: 'Preview DeepL translation' });
  await translationPreview.getByText('Revidert norsk tekst.').waitFor();
  assert.equal(await newTranslation.innerText(), 'Direkte redigering');
  await translationPreview.getByRole('button', { name: 'Cancel' }).click();
  assert.equal(await newTranslation.innerText(), 'Direkte redigering');
  await useTranslation.click();
  await translationPreview.getByRole('button', { name: 'Replace Norwegian text' }).click();
  await translator.waitFor({ state: 'detached' });
  assert.equal(await newTranslation.innerText(), 'Revidert norsk tekst.');
  await page.getByRole('button', { name: 'Copy formatted Bokmål' }).click();
  await page.getByText('Formatted Bokmål copied to the clipboard.').waitFor();
  const copied = await app.evaluate(() => globalThis.copiedBokmal);
  assert(copied.html.includes('<h1>En kontekstuell overskrift</h1>'));
  assert(copied.html.includes('<p>Revidert norsk tekst.</p>'));
  assert(copied.text.includes('Revidert norsk tekst.'));
  assert(!copied.text.includes('A new block'));
  const sidebar = page.getByRole('complementary', { name: 'Article sidebar' });
  const search = sidebar.getByRole('textbox', { name: 'Search library' });
  await search.fill('Saved search');
  const oldWidth = (await sidebar.boundingBox()).width;
  await sidebar.getByRole('button', { name: 'Collapse sidebar' }).click();
  const expandSidebar = sidebar.getByRole('button', { name: 'Expand sidebar' });
  assert.equal(await expandSidebar.getAttribute('aria-expanded'), 'false');
  assert.equal(await search.isVisible(), false);
  await page.waitForFunction(width => document.querySelector('.article-sidebar').getBoundingClientRect().width < width - 100, oldWidth);
  assert.equal(await page.evaluate(() => localStorage.getItem('bokmal.sidebarCollapsed')), 'true');
  await sidebar.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: 'Cancel' }).click();
  await sidebar.getByRole('button', { name: 'New article' }).click();
  await page.getByRole('dialog', { name: 'Discard unsaved changes?' }).getByRole('button', { name: 'Cancel' }).click();
  await expandSidebar.click();
  assert.equal(await search.inputValue(), 'Saved search');
  assert.equal(await newTranslation.innerText(), 'Revidert norsk tekst.');
  await app.evaluate(({ Menu }) => {
   Menu.prototype.popup = function () { globalThis.editMenuLabels = this.items.map(item => item.label); };
  });
  await newTranslation.click({ button: 'right' });
  assert.deepEqual(await app.evaluate(() => globalThis.editMenuLabels), ['Cut', 'Copy', 'Paste']);
 } finally {
  if (app) {
   await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
   await app.close().catch(() => {});
  }
  fs.rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
 }
});
