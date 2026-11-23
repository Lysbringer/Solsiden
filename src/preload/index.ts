import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopAPI } from '../shared/types';
const api: DesktopAPI = {
 isDeveloperEdition: process.argv.includes('--solside-developer-edition'),
 suggestDeepLHeadline: (headline, context) => ipcRenderer.invoke('article:suggest-deepl-headline', { headline, context }),
 openDeepLPanel: (id, source, bounds) => ipcRenderer.invoke('article:open-deepl-panel', id, source, bounds),
 positionDeepLPanel: (id, bounds) => ipcRenderer.send('article:position-deepl-panel', id, bounds),
 closeDeepLPanel: id => ipcRenderer.invoke('article:close-deepl-panel', id),
 readDeepLTranslation: id => ipcRenderer.invoke('article:read-deepl-translation', id),
 copyFormattedBokmal: project => ipcRenderer.invoke('article:copy-formatted-bokmal', project),
 translate: rows => ipcRenderer.invoke('article:translate', rows),
 translateDeepL: rows => ipcRenderer.invoke('article:translate-deepl', rows),
 previewImage: url => ipcRenderer.invoke('article:image', url),
 cancelExtraction: requestId => ipcRenderer.invoke('article:cancel', requestId),
 extract: (url,requestId) => ipcRenderer.invoke('article:extract', url,requestId),
 onCloseCheck: check => { const listener = (_event: unknown, token: number) => ipcRenderer.send('close:state', token, check()); ipcRenderer.on('close:check', listener); return () => ipcRenderer.removeListener('close:check', listener); },
 deleteArticles: ids => ipcRenderer.invoke('projects:delete-many',ids),
 deleteArticle: id => ipcRenderer.invoke('projects:delete',id),
 list: () => ipcRenderer.invoke('projects:list'),
 save: project => ipcRenderer.invoke('projects:save', project),
 settings: () => ipcRenderer.invoke('settings:get'),
 configure: (provider, key) => ipcRenderer.invoke('settings:set', provider, key),
 setDirty: dirty => ipcRenderer.send('project:dirty', dirty),
};
contextBridge.exposeInMainWorld('desktop', api);
