import React, { useEffect, useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import type { ExtractedArticle } from '../shared/future-services';
import type { Project } from '../shared/types';
import './style.css';
import {ArticleLibrary} from './ArticleLibrary';
import {DeleteArticleDialog} from './DeleteArticleDialog';
import { SaveAsDialog } from './SaveAsDialog';
import { Icon, ExtractionLoading } from './ExtractionLoading';
import { ExtractionPreview } from './ExtractionPreview';
import { ArticleEditor } from './ArticleEditor';
import { ChatGPTTranslationDialog } from './ChatGPTTranslationDialog';
import { ConfirmArticleDialog } from './ConfirmArticleDialog';
import { editBlock, editorProject } from '../shared/rich-text';
import { flattenBlocks, normalizeProject, type Inline, EditorSession } from '../shared/project';
type Theme = 'light' | 'dark';
const fresh = (): Project => ({ id: crypto.randomUUID(), title: 'Untitled article', url: '', paragraphs: [{ id: crypto.randomUUID(), original: '', translation: '' }], updatedAt: '' });
function App() {
 const [project, setProject] = useState(fresh);
 const session = useRef(new EditorSession(project));
 const [dirty, setDirty] = useState(false);
 const [confirmation, setConfirmation] = useState<{ title: string; detail: string; action: string; run: () => void }>();
 const [library, setLibrary] = useState<Project[]>([]);
 const [deleteTarget,setDeleteTarget]=useState<Project[]>();
 const [deleting,setDeleting]=useState(false);
 const deletingRef=useRef(false);
 const [deleteError,setDeleteError]=useState('');
 const [saveAsOpen,setSaveAsOpen]=useState(false);
 const [saving,setSaving]=useState(false);
 const [saveError,setSaveError]=useState('');
 const [settings, showSettings] = useState(false);
 const [theme, setTheme] = useState<Theme>(() => localStorage.getItem('solside.theme') === 'dark' ? 'dark' : 'light');
 useEffect(() => {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('solside.theme', theme);
 }, [theme]);
 const [provider, setProvider] = useState('OpenAI');
 const [savedProvider, setSavedProvider] = useState('OpenAI');
 const [key, setKey] = useState('');
 const [configuredProviders, setConfiguredProviders] = useState<string[]>([]);
 const translationPending = useRef(false);
 const [translating, setTranslating] = useState(false);
 const [translationError, setTranslationError] = useState('');
 const [chatTranslation, setChatTranslation] = useState<{ rows: string[][]; apply: (rows: string[][]) => void }>();
 const [message, setMessage] = useState('Ready · Projects are stored on this computer');
 const [preview, setPreview] = useState<ExtractedArticle>();
 const [urlExpanded, setUrlExpanded] = useState(true);
 const pendingExtraction=useRef<{id:string;cancelled:boolean} | undefined>(undefined);
 const [extractionError,setExtractionError]=useState('');
 const [cancelling,setCancelling]=useState(false);
 const [loading, setLoading] = useState(false);
 useEffect(() => window.desktop.onCloseCheck(() => session.current.needsCloseWarning()), []);
 const [query, setQuery] = useState('');
 const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('bokmal.sidebarCollapsed') === 'true');
 useEffect(() => { localStorage.setItem('bokmal.sidebarCollapsed', String(sidebarCollapsed)); }, [sidebarCollapsed]);
 const refresh = () => window.desktop.list().then(setLibrary).catch(error => setMessage(String(error)));
 useEffect(() => { refresh(); window.desktop.settings().then(s => {
  setProvider(s.provider); setSavedProvider(s.provider); setConfiguredProviders(s.configuredProviders ?? []);
 }).catch(error => setMessage(String(error))); }, []);
 function sync() { setProject(session.current.project); setDirty(session.current.dirty); window.desktop.setDirty(session.current.dirty); }
 function change(next: Project) { session.current.edit(next); sync(); }
 function open(next: Project) {
  const proceed = () => {
   session.current.open(next, () => true);
   sync(); setUrlExpanded(!next.url); setTranslationError('');
  };
  if (session.current.dirty) setConfirmation({
   title: 'Discard unsaved changes?', detail: 'Switching articles will discard the current unsaved changes.',
   action: 'Discard and switch', run: proceed,
  });
  else proceed();
 }
 async function copyBokmal() {
  try {
   await window.desktop.copyFormattedBokmal(session.current.project);
   setMessage('Formatted Bokmål copied to the clipboard.');
  } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
 }
 function prepareTranslation() {
  setTranslationError('');
  const snapshot = session.current.project;
  const generation = session.current.generation;
  const targets = flattenBlocks(editorProject(snapshot).blocks!).filter(block =>
   block.kind !== 'image' && block.original.text.some(span => span.text.trim()) &&
   !block.translation.text.some(span => span.text.trim()) &&
   !(block.id === snapshot.id + ':headline' && snapshot.title === 'Untitled article')
  );
  if (!targets.length) { setTranslationError('There is no untranslated English text in this article.'); return; }
  const source = targets.map(block => block.original.text);
  function apply(rows: Inline[][]) {
   if (generation !== session.current.generation || snapshot !== session.current.project) {
    setMessage('The article changed during the request. Run it again to use your current text.');
    return;
   }
   const next = editorProject(snapshot);
   const blocks = new Map(flattenBlocks(next.blocks!).map(block => [block.id, block]));
   const paragraphs = new Map(next.paragraphs.map(paragraph => [paragraph.id, paragraph]));
   targets.forEach((target, index) => {
    const text = rows[index];
    blocks.get(target.id)!.translation.text = text;
    const translation = text.map(span => span.text).join('');
    const paragraph = paragraphs.get(target.id);
    if (paragraph) paragraph.translation = translation;
    else next.paragraphs.push({ id: target.id, original: target.original.text.map(span => span.text).join(''), translation });
   });
   change(next);
   setMessage('Bokmål draft ready. Review it and save manually.');
  }
  return {
   source,
   rows: source.map(row => row.map(span => span.text)),
   apply,
   applySpans: (rows: string[][]) => apply(source.map((row, index) =>
    row.map((span, offset) => ({ ...span, text: rows[index][offset] })))),
  };
 }
 async function translate() {
  if (translationPending.current) return;
  if (savedProvider !== 'OpenAI' && savedProvider !== 'DeepL') {
   setTranslationError('Choose OpenAI or DeepL in Settings to translate via API.');
   return;
  }
  const prepared = prepareTranslation();
  if (!prepared) return;
  const generation = session.current.generation;
  translationPending.current = true;
  setTranslating(true);
  try {
   if (savedProvider === 'DeepL') prepared.apply(await window.desktop.translateDeepL(prepared.source));
   else prepared.applySpans(await window.desktop.translate(prepared.rows));
  } catch (error) {
   if (generation === session.current.generation) setTranslationError(String(error));
  } finally {
   translationPending.current = false;
   setTranslating(false);
  }
 }
 function loadArticle() {
  if (pendingExtraction.current) return;
  if (session.current.dirty) setConfirmation({
   title: 'Load article preview?', detail: 'Your current unsaved article will stay open until you accept the replacement.',
   action: 'Load preview', run: () => void startExtraction(),
  });
  else void startExtraction();
 }
 async function startExtraction() {
  if(pendingExtraction.current)return;
  const request={id:crypto.randomUUID(),cancelled:false};pendingExtraction.current=request;
  setLoading(true);setCancelling(false);setExtractionError('');setPreview(undefined);
  try { const result=await window.desktop.extract(session.current.project.url,request.id);if(pendingExtraction.current===request&&!request.cancelled)setPreview(result); }
  catch(error) { if(pendingExtraction.current===request&&!request.cancelled){setExtractionError(String(error));setMessage('Extraction failed. Review the error above the article.');} }
  finally { if(pendingExtraction.current===request&&!request.cancelled){pendingExtraction.current=undefined;setLoading(false);} }
 }
 async function cancelExtraction() {
  const request=pendingExtraction.current;if(!request||request.cancelled)return;
  request.cancelled=true;setCancelling(true);
  try { await window.desktop.cancelExtraction(request.id);setMessage('Extraction cancelled. Your article is unchanged.'); }
  catch(error){setExtractionError('Could not confirm cancellation: '+String(error));}
  finally {if(pendingExtraction.current===request){pendingExtraction.current=undefined;setLoading(false);setCancelling(false);}}
 }
 function acceptArticle() {
  if (!preview) return;
  const proceed = () => {
   session.current.acceptExtraction(preview, crypto.randomUUID(), () => true);
   sync(); setUrlExpanded(false); setPreview(undefined); setMessage('Article accepted. Save manually to keep it.');
  };
  if (session.current.dirty) setConfirmation({
   title: 'Discard unsaved changes?', detail: 'Accepting the preview will replace the current article and discard its unsaved changes.',
   action: 'Discard and accept', run: proceed,
  });
  else proceed();
 }
 async function save(asNew = false, copyTitle?:string):Promise<boolean> {
  if(session.current.saving){setSaveError('A save is already in progress.');return false;}
  const title=asNew?copyTitle?.trim():session.current.project.title;
  if(!title?.trim()){setSaveError('Enter an article name before saving.');return false;}
  setSaving(true);setSaveError('');
  try {
   const saved=await session.current.save(window.desktop.save,asNew?crypto.randomUUID():undefined,title);
   sync();
   setLibrary(current=>[saved,...current.filter(item=>item.id!==saved.id)]);
   if(asNew){setQuery('');setSaveAsOpen(false);}
   setMessage(session.current.dirty?'Snapshot saved; newer edits are unsaved':'Project saved locally');
   try{setLibrary(await window.desktop.list());}catch(error){setSaveError('Project saved, but the library could not refresh: '+String(error));}
   return true;
  }catch(error){sync();setSaveError('Save failed: '+String(error));setMessage('Save failed. Your article remains open.');return false;}
  finally{setSaving(false);}
 }
 async function deleteArticle() {
  if(!deleteTarget||deletingRef.current||session.current.saving)return;
  deletingRef.current=true;setDeleting(true);setDeleteError('');
  const target=deleteTarget;
  try {
   const ids=target.map(p=>p.id);
   if(ids.length===1)await window.desktop.deleteArticle(ids[0]);else await window.desktop.deleteArticles(ids);
   setLibrary(current=>current.filter(item=>!target.some(p=>p.id===item.id)));
   if(target.some(p=>p.id===session.current.project.id)){session.current.open(fresh(),()=>true);sync();setUrlExpanded(true);}
   setDeleteTarget(undefined);setMessage(target.length===1?'Article deleted from the local library.':target.length+' articles deleted from the local library.');
   try{setLibrary(await window.desktop.list());}catch(error){setDeleteError('Article deleted, but library refresh failed: '+String(error));}
  }catch(error){setDeleteError('Deletion failed: '+String(error));}
  finally{deletingRef.current=false;setDeleting(false);}
 }
 const blocks=editorProject(project).blocks!;
 function changeBlock(id:string,side:'original'|'translation',text:Inline[]) { change(editBlock(session.current.project,id,side,text)); }
 function addBlock() { const next=normalizeProject(session.current.project);const id=crypto.randomUUID();next.blocks!.push({id,kind:'paragraph',original:{text:[]},translation:{text:[]}});next.paragraphs.push({id,original:'',translation:''});change(next); }
 const newArticle = () => open(fresh());
 const openSettings = () => { setProvider(savedProvider); showSettings(true); };
 return <div className="app"><aside className={sidebarCollapsed ? "article-sidebar is-collapsed" : "article-sidebar"} aria-label="Article sidebar">
  <div className="sidebar-top">
   <div className="sidebar-brand">
    <img className="brand" src="./solside-icon.png" width="40" height="40" alt=""/>
    <h2 className="solside-wordmark" hidden={sidebarCollapsed}>Solside <span>oversettelse</span></h2>
   </div>
   <button type="button" className="sidebar-toggle" aria-expanded={!sidebarCollapsed} aria-controls="sidebar-content"
    aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
    title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={() => setSidebarCollapsed(value => !value)}>
    <span className="sidebar-toggle-icon" aria-hidden="true"/>
   </button>
  </div>
  {sidebarCollapsed && <div className="sidebar-rail-actions">
   <button type="button" className="new sidebar-rail-action" aria-label="New article" title="New article" onClick={newArticle}><Icon name="plus"/></button>
   <button type="button" className="sidebar-toggle sidebar-rail-action sidebar-rail-settings" aria-label="Settings" title="Settings" onClick={openSettings}><span aria-hidden="true">⚙</span></button>
  </div>}
  <div id="sidebar-content" className="sidebar-content" hidden={sidebarCollapsed}><p className="muted">Your local translation workspace</p><button className="new" onClick={newArticle}>＋ New article</button><h4>ARTICLE LIBRARY <span>{library.length}</span></h4><input aria-label="Search library" placeholder="Search saved articles…" value={query} onChange={e => setQuery(e.target.value)}/><ArticleLibrary articles={library} activeId={project.id} draft={library.some(item=>item.id===project.id) ? undefined : project} query={query} busy={saving||deleting} onOpen={open} onDelete={targets=>{if(session.current.saving||deletingRef.current)return;setDeleteError('');setDeleteTarget(targets);}}/><button onClick={openSettings}>⚙ Settings</button><small className="local">● Local workspace</small></div></aside><main>
  {window.desktop.isDeveloperEdition && <div className="developer-edition-banner">Developer Edition</div>}
  <header className="article-header"><h1>{project.title || "Untitled article"}</h1><span className={dirty ? 'badge dirty' : 'badge'}>{dirty ? '● Unsaved changes' : '✓ All changes saved'}</span></header><section className="url"><button className="url-toggle" onClick={()=>setUrlExpanded(!urlExpanded)} aria-expanded={urlExpanded}><Icon name={urlExpanded ? "up" : "down"}/>{urlExpanded ? "Hide article URL" : "Article URL: show"}</button>{urlExpanded && <><label htmlFor="url">ARTICLE URL</label><div><input id="url" placeholder="https://example.com/english-article" value={project.url} onChange={e => change({...project, url: e.target.value})}/><button disabled={loading} onClick={loadArticle}>Load article</button></div><small>Load a public article URL, review the preview, then accept. Nothing is saved automatically.</small></>}</section><nav><button disabled={saving} onClick={() => save()}>Save</button><button disabled={saving} onClick={() => {setSaveError('');setSaveAsOpen(true);}}>Save As</button><i/><button disabled={translating||loading||saving} onClick={()=>{const draft=prepareTranslation();setChatTranslation(draft&&{rows:draft.rows,apply:draft.applySpans});}}>Translate with ChatGPT</button><button disabled={translating||loading||saving} title={savedProvider === "DeepL" ? "Uses your DeepL API allowance" : "Uses GPT-5.4 and OpenAI API credits"} onClick={()=>translate()}>{translating ? "Translating…" : savedProvider === "DeepL" ? "Translate with DeepL" : "Translate via API"}</button><button onClick={copyBokmal}>Copy formatted Bokmål</button><span>Manual saving only</span></nav>{translationError&&<div className="extraction-error" role="alert"><strong>Translation status</strong><p>{translationError}</p></div>}{deleteError&&!deleteTarget&&<div className="extraction-error" role="alert"><strong>Article deletion</strong><p>{deleteError}</p></div>}{saveError&&!saveAsOpen&&<div className="extraction-error" role="alert"><strong>Save status</strong><p>{saveError}</p></div>}{extractionError&&<div className="extraction-error" role="alert"><strong>Article extraction failed</strong><p>{extractionError}</p><small>Check the URL and your connection. Access restrictions will not be bypassed.</small><button disabled={loading} onClick={loadArticle}>Retry extraction</button></div>}<div className="columns"><h3>English original <small>EN · Source</small></h3><h3>Norwegian translation <small>NB · Editable</small></h3></div><div className="article-workspace-shell" aria-busy={loading}><div className="editor-container" inert={loading}><ArticleEditor blocks={blocks} sessionKey={String(session.current.generation)} onEdit={changeBlock} onAdd={addBlock}/></div>{loading&&<ExtractionLoading cancelling={cancelling} onCancel={cancelExtraction}/>}</div><footer>{message}<span>{project.paragraphs.length} aligned paragraph{project.paragraphs.length === 1 ? '' : 's'}</span></footer></main>{deleteTarget&&<DeleteArticleDialog title={deleteTarget[0].title} count={deleteTarget.length} unsaved={deleteTarget.some(p=>p.id===project.id)&&dirty} busy={deleting} error={deleteError} onDelete={deleteArticle} onCancel={()=>{if(!deletingRef.current){setDeleteTarget(undefined);setDeleteError('');}}}/>} {saveAsOpen&&<SaveAsDialog initialTitle={session.current.project.title+' (copy)'} busy={saving} error={saveError} onSave={title=>save(true,title)} onCancel={()=>{setSaveAsOpen(false);setSaveError('');}}/>}{chatTranslation&&<ChatGPTTranslationDialog rows={chatTranslation.rows} onImport={rows=>{chatTranslation.apply(rows);setChatTranslation(undefined);}} onClose={()=>setChatTranslation(undefined)}/>} {confirmation&&<ConfirmArticleDialog title={confirmation.title} detail={confirmation.detail} action={confirmation.action} onCancel={()=>setConfirmation(undefined)} onConfirm={()=>{setConfirmation(undefined);confirmation.run();}}/>}{preview && <ExtractionPreview article={preview} onAccept={acceptArticle} onCancel={()=>setPreview(undefined)}/>}{settings && <div className="overlay"><section role="dialog" aria-modal="true" aria-label="Settings" className="modal"><h2>Settings</h2>
   <label>Appearance
    <select value={theme} onChange={event => setTheme(event.target.value === "dark" ? "dark" : "light")}>
     <option value="light">Light</option>
     <option value="dark">Dark</option>
    </select>
   </label>
   <h3 className="settings-section-title">Translation provider</h3><p>Credentials are encrypted by Windows and kept outside your projects. Choose OpenAI or DeepL for direct translation. Translate with ChatGPT works without an API key.</p><label>Provider<select value={provider} onChange={e => {setProvider(e.target.value);setKey("");}}><option>OpenAI</option><option>DeepL</option><option>Anthropic</option><option>Local provider</option></select></label><label>API key<input type="password" autoComplete="off" value={key} placeholder={configuredProviders.includes(provider) ? 'Key stored · leave blank to keep' : 'Enter API key'} onChange={e => setKey(e.target.value)}/></label><div className="actions"><button onClick={() => {setKey(''); showSettings(false);}}>Cancel</button><button className="new" onClick={async () => {try {await window.desktop.configure(provider, key); const saved=await window.desktop.settings();setSavedProvider(saved.provider);setConfiguredProviders(saved.configuredProviders ?? []); setKey(''); showSettings(false); setMessage('Settings saved securely');} catch(error) {setMessage(String(error));}}}>Save settings</button></div></section></div>}</div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
