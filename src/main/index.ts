import { app, BrowserWindow, clipboard, ipcMain, dialog, Menu, safeStorage, session, utilityProcess, WebContentsView } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import initSqlJs from 'sql.js';
import type { DeepLPanelBounds, Project } from '../shared/types';
import { ExtractionRunner } from './extraction/runner';
import { ProjectStore } from './project-store';
import { translateToBokmal } from './translate';
import { suggestDeepLHeadline, translateWithDeepL } from './deepl';
import { formattedBokmal } from '../shared/formatted-bokmal';
const appData = app.getPath('appData');
const testProfile = process.env.BOKMAL_TEST_USER_DATA;
const articleProfile = testProfile || path.join(appData, app.isPackaged ? 'Solside' : 'Solside Developer Edition');
const legacyProfile = path.join(appData, 'bokmal-desk');
// Stage a complete copy before switching profiles. Keep the old data for recovery.
if (!testProfile && app.isPackaged && !fs.existsSync(articleProfile) && fs.existsSync(legacyProfile)) {
 const staging = fs.mkdtempSync(path.join(appData, 'Solside-migration-'));
 fs.cpSync(legacyProfile, staging, { recursive: true });
 fs.renameSync(staging, articleProfile);
}
if (!testProfile && !app.isPackaged) fs.mkdirSync(articleProfile, { recursive: true });
app.setName('Solside');
app.setPath('userData', articleProfile);
let dirty = false;
if (!app.requestSingleInstanceLock()) app.quit();
else app.whenReady().then(async () => {
 const root = app.getPath('userData');
 const dbPath = path.join(root, 'projects.sqlite');
 const settingsPath = path.join(root, 'settings.json');
 const SQL = await initSqlJs();
 const db = fs.existsSync(dbPath) ? new SQL.Database(fs.readFileSync(dbPath)) : new SQL.Database();
 const store = new ProjectStore(db, dbPath);
 const win = new BrowserWindow({ width: 1440, height: 940, minWidth: 1000, minHeight: 650, backgroundColor: '#FFF8EC',
  title: `Solside ${app.getVersion()}${app.isPackaged ? '' : ' — Developer Edition'}`,
  icon: path.join(__dirname, '../../dist/solside-icon.png'),
  webPreferences: {
   preload: path.join(__dirname, '../preload/index.js'),
   contextIsolation: true,
   nodeIntegration: false,
   sandbox: true,
   additionalArguments: app.isPackaged ? [] : ['--solside-developer-edition'],
  } });
 // Keep the version visible when the loaded page supplies its own title.
 win.on('page-title-updated', event => event.preventDefault());
 function addEditMenu(contents: Electron.WebContents) {
  contents.on('context-menu', (_event, { isEditable, editFlags }) => {
   if (!isEditable && !editFlags.canCopy) return;
   const copy = { label: 'Copy', enabled: editFlags.canCopy, click: () => contents.copy() };
   const items = isEditable ? [
    { label: 'Cut', enabled: editFlags.canCut, click: () => contents.cut() },
    copy,
    { label: 'Paste', enabled: editFlags.canPaste, click: () => contents.paste() },
   ] : [copy];
   Menu.buildFromTemplate(items).popup({ window: win });
  });
 }
 addEditMenu(win.webContents);
 win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
 win.webContents.on('will-navigate', event => event.preventDefault());
 const trusted = (event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) => { if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) throw new Error('Untrusted sender'); };
 const extractionRunner=new ExtractionRunner(url=>utilityProcess.fork(path.join(__dirname,'extraction/worker.js'),[url],{stdio:'pipe',execArgv:[]}));
 ipcMain.handle('article:extract', async(event,url,requestId='legacy')=>{
  trusted(event);
  if(typeof url!=='string'||url.length>4096||typeof requestId!=='string'||requestId.length>128)throw Error('Invalid extraction request.');
  return extractionRunner.run(url,requestId);
 });
 ipcMain.handle('article:cancel', (event,requestId)=>{trusted(event);if(typeof requestId!=='string')throw Error('Invalid extraction request.');extractionRunner.cancel(requestId);});
 let imageLoading=false;
 ipcMain.handle('article:image', async(event,url)=>{
  trusted(event);if(imageLoading)throw Error('An image request is already running.');
  if(typeof url!=='string'||url.length>4096)throw Error('Invalid image URL.');
  imageLoading=true;
  try{return await new Promise((resolve,reject)=>{
   const worker=utilityProcess.fork(path.join(__dirname,'extraction/worker.js'),[url,'image'],{stdio:'pipe',execArgv:[]});
   const timer=setTimeout(()=>{worker.kill();reject(Error('Image timed out'));},20000);
   worker.once('message',message=>{clearTimeout(timer);worker.kill();message.error?reject(Error(message.error)):resolve(message.result);});
   worker.once('exit',()=>{clearTimeout(timer);reject(Error('Image process stopped'));});
  });}finally{imageLoading=false;}
 });
 ipcMain.handle('projects:delete-many',(event,ids)=>{trusted(event);store.deleteMany(ids);});
 ipcMain.handle('projects:delete',(event,id)=>{trusted(event);store.delete(id);});
 ipcMain.handle('projects:list', event => { trusted(event); return store.list(); });
 ipcMain.handle('projects:save', (event, input: Project) => { trusted(event); return store.save(input); });
 ipcMain.handle('article:copy-formatted-bokmal', (event, project: Project) => {
  trusted(event);
  clipboard.write(formattedBokmal(project));
 });
 let translating = false;
 function readSettings() {
  const saved = fs.existsSync(settingsPath) ? JSON.parse(fs.readFileSync(settingsPath, 'utf8')) : {};
  const keys: Record<string, string> = { ...(saved.key && saved.provider ? { [saved.provider]: saved.key } : {}), ...saved.keys };
  return { provider: saved.provider ?? 'OpenAI', keys };
 }
 async function runTranslation<T>(provider: 'OpenAI' | 'DeepL', rows: unknown, translate: (rows: unknown, key: string) => Promise<T>) {
  if (translating) throw new Error('A translation is already running.');
  const encrypted = readSettings().keys[provider];
  if (!encrypted) throw new Error('Save an ' + provider + ' API key in Settings to translate.');
  let key: string;
  try { key = safeStorage.decryptString(Buffer.from(encrypted, 'base64')); }
  catch { throw new Error('The saved ' + provider + ' API key could not be read. Enter the key again in Settings.'); }
  translating = true;
  try { return await translate(rows, key); }
  finally { translating = false; }
 }
 ipcMain.handle('article:translate', (event, rows: unknown) => {
  trusted(event);
  return runTranslation('OpenAI', rows, translateToBokmal);
 });
 ipcMain.handle('article:translate-deepl', (event, rows: unknown) => {
  trusted(event);
  return runTranslation('DeepL', rows, translateWithDeepL);
 });
 ipcMain.handle('article:suggest-deepl-headline', (event, input: unknown) => {
  trusted(event);
  return runTranslation('DeepL', input, suggestDeepLHeadline);
 });
 const deepLSession = session.fromPartition('bokmal-deepl-panel');
 const isDeepL = (destination: string) => {
  try { return ['https://www.deepl.com', 'https://deepl.com'].includes(new URL(destination).origin); }
  catch { return false; }
 };
 deepLSession.setPermissionRequestHandler((contents, permission, callback) =>
  callback(permission === 'clipboard-sanitized-write' && isDeepL(contents.getURL())));
 deepLSession.setPermissionCheckHandler((_contents, permission, origin) =>
  permission === 'clipboard-sanitized-write' && isDeepL(origin));
 deepLSession.on('will-download', event => event.preventDefault());
 let deepLPanel: { id: string; view: WebContentsView } | undefined;
 function closeDeepLPanel() {
  const panel = deepLPanel;
  if (!panel) return;
  deepLPanel = undefined;
  if (!win.isDestroyed()) win.contentView.removeChildView(panel.view);
  panel.view.webContents.close();
 }
 function positionDeepLPanel(id: string, bounds: DeepLPanelBounds) {
  if (deepLPanel?.id !== id || !bounds || ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)) return;
  const { width, height } = win.getContentBounds();
  const x = Math.max(0, Math.min(width, Math.round(bounds.x)));
  const y = Math.max(0, Math.min(height, Math.round(bounds.y)));
  deepLPanel.view.setBounds({ x, y, width: Math.max(0, Math.min(width - x, Math.round(bounds.width))),
   height: Math.max(0, Math.min(height - y, Math.round(bounds.height))) });
 }
 win.on('closed', closeDeepLPanel);
 win.webContents.on('did-start-loading', closeDeepLPanel);
 ipcMain.on('article:position-deepl-panel', (event, id: string, bounds: DeepLPanelBounds) => {
  trusted(event);
  positionDeepLPanel(id, bounds);
 });
 ipcMain.handle('article:close-deepl-panel', (event, id: string) => {
  trusted(event);
  if (deepLPanel?.id === id) {
   closeDeepLPanel();
   win.webContents.focus();
  }
 });
 ipcMain.handle('article:read-deepl-translation', async (event, id: string) => {
  trusted(event);
  const panel = deepLPanel;
  if (!panel || panel.id !== id || !isDeepL(panel.view.webContents.getURL())) {
   throw new Error('Open DeepL for this paragraph first.');
  }
  const result = await panel.view.webContents.executeJavaScript(`
   (() => {
    const host = document.querySelector('[data-testid="translator-target-input"]');
    if (!host) return '';
    const selector = 'textarea, [contenteditable], [role="textbox"]';
    const field = host.matches(selector) ? host : host.querySelector(selector) ?? host.shadowRoot?.querySelector(selector) ?? host;
    if (field instanceof HTMLTextAreaElement) return field.value;
    return field.innerText || '';
   })()
  `);
  if (deepLPanel !== panel || typeof result !== 'string' || !result.trim() || result.length > 100000) {
   throw new Error('DeepL has no matching translation to use yet.');
  }
  return result.trim();
 });
 ipcMain.handle('article:open-deepl-panel', async (event, id: string, source: string, bounds: DeepLPanelBounds) => {
  trusted(event);
  if (typeof id !== 'string' || id.length > 80 || typeof source !== 'string' || !source.trim() || source.length > 100000) {
   throw new Error('Select a field with English text to open in DeepL.');
  }
  closeDeepLPanel();
  const view = new WebContentsView({
   webPreferences: { session: deepLSession, sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  addEditMenu(view.webContents);
  const restrictNavigation = (navigation: Electron.Event<{ url: string }>) => {
   if (!isDeepL(navigation.url)) navigation.preventDefault();
  };
  view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  view.webContents.on('will-navigate', restrictNavigation);
  view.webContents.on('will-redirect', restrictNavigation);
  deepLPanel = { id, view };
  win.contentView.addChildView(view);
  positionDeepLPanel(id, bounds);
  try {
   await view.webContents.loadURL('https://www.deepl.com/en/translator#en/nb/');
   if (deepLPanel?.view !== view) return;
   view.webContents.setZoomFactor(0.85);
   await view.webContents.insertCSS(`
    html { overflow-y: scroll !important; }
    body:has([data-testid="translator"] main [data-testid="translator-source-input"]) :is(header, footer):not(main *) {
     display: none !important;
    }
    [data-testid="translator"]:has(main [data-testid="translator-source-input"]) > :not(main, :has(main)) {
     display: none !important;
    }
    [data-testid="translator"] main:has([data-testid="translator-source-input"]) {
     padding-block: 0 !important;
    }
    [data-testid="translator"] main:has([data-testid="translator-source-input"]) > nav,
    [data-testid="translator"] main div:has(> div > #dictionary-header):not(:has([data-testid="translator-source-input"])),
    [data-testid="side-panel-collapsable-wrapper"],
    [data-testid="side-panel-expand-button"] {
     display: none !important;
    }
   `);
   const inputReady = await view.webContents.executeJavaScript(`
    new Promise(resolve => {
     const deadline = Date.now() + 10000;
     function selectSource() {
      const host = document.querySelector('[data-testid="translator-source-input"]');
      const selector = 'textarea:not(:disabled), [contenteditable="true"]';
      const input = host?.matches(selector) ? host : host?.querySelector(selector) ?? host?.shadowRoot?.querySelector(selector);
      if (!input) {
       if (Date.now() < deadline) setTimeout(selectSource, 100);
       else resolve(false);
       return;
      }
      input.focus({ preventScroll: true });
      if (input instanceof HTMLTextAreaElement) input.select();
      else {
       const range = document.createRange();
       range.selectNodeContents(input);
       const selection = window.getSelection();
       selection.removeAllRanges();
       selection.addRange(range);
      }
      resolve(true);
     }
     selectSource();
    })
   `);
   if (deepLPanel?.view !== view) return;
   if (!inputReady) throw new Error('DeepL source field unavailable.');
   await view.webContents.insertText(source);
  }
  catch {
   if (deepLPanel?.view !== view) return;
   closeDeepLPanel();
   throw new Error('Could not load DeepL. Check your connection and try again.');
  }
 });
 ipcMain.on('project:dirty', (event, value) => { trusted(event); dirty = value === true; });
 ipcMain.handle('settings:get', event => {
  trusted(event);
  const { provider, keys } = readSettings();
  return { provider, hasKey: !!keys[provider], configuredProviders: Object.keys(keys).filter(name => !!keys[name]) };
 });
 ipcMain.handle('settings:set', (event, provider, key) => {
  trusted(event); if (!['OpenAI', 'DeepL', 'Anthropic', 'Local provider'].includes(provider) || typeof key !== 'string') throw new Error('Invalid settings');
  key = key.trim();
  if (key && !safeStorage.isEncryptionAvailable()) throw new Error('Windows encryption is unavailable');
  const { keys } = readSettings();
  if (key) keys[provider] = safeStorage.encryptString(key).toString('base64');
  const temp = settingsPath + '.tmp';
  fs.writeFileSync(temp, JSON.stringify({ provider, keys }));
  fs.renameSync(temp, settingsPath);
 });
 // Ask the renderer for its current session state on every close. A stale
 // asynchronous dirty notification must never authorize closing the window.
 let allowClose = false, closeToken = 0, closeTimer: ReturnType<typeof setTimeout> | undefined;
 const finishClose = (isDirty: boolean) => {
  if (isDirty && dialog.showMessageBoxSync(win, { type: 'warning', message: 'Discard unsaved changes?', detail: 'Return to the workspace to save your project.', buttons: ['Keep editing', 'Discard changes'], defaultId: 0, cancelId: 0 }) === 0) return;
  allowClose = true; win.close();
 };
 ipcMain.on('close:state', (event, token, value) => { trusted(event); if (!closeTimer || token !== closeToken) return; clearTimeout(closeTimer); closeTimer = undefined; finishClose(value !== false); });
 win.on('close', event => {
  if (allowClose) return;
  event.preventDefault(); if (closeTimer) return;
  closeTimer = setTimeout(() => { closeTimer = undefined; finishClose(true); }, 2000);
  win.webContents.send('close:check', ++closeToken);
 });
 await win.loadFile(path.join(__dirname, '../../dist/index.html'));
});
app.on('window-all-closed', () => app.quit());
