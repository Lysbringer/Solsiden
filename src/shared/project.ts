import type { Project } from './types';
export type Inline = { text: string; marks?: ('bold' | 'italic' | 'underline' | 'code')[]; href?: string };
export type BlockContent = { text: Inline[]; image?: { src: string; alt: string }; caption?: Inline[] };
export interface ContentBlock { children?: ContentBlock[]; factRole?: 'label' | 'title' | 'source' | 'list-item'; listStyle?: 'ordered' | 'unordered'; ordinal?: number; id: string; kind: 'factbox' | 'headline' | 'lead' | 'introduction' | 'paragraph' | 'subheading' | 'image' | 'caption'; original: BlockContent; translation: BlockContent }
export function flattenBlocks(blocks:ContentBlock[]):ContentBlock[] { return blocks.flatMap(b=>b.kind==='factbox'?flattenBlocks(b.children??[]):[b]); }
export function allBlocks(blocks:ContentBlock[]):ContentBlock[] {return blocks.flatMap(b=>[b,...allBlocks(b.children??[])]);}
export function normalizeProject(input: Project): Project {
 if (!input || typeof input.id !== 'string' || typeof input.title !== 'string' || typeof input.url !== 'string' || !Array.isArray(input.paragraphs)) throw new Error('Invalid project');
 if (input.schemaVersion !== undefined && input.schemaVersion !== 2 && input.schemaVersion !== 3 && input.schemaVersion !== 4) throw new Error('Unsupported project version');
 const ids = new Set<string>();
 for (const p of input.paragraphs) { if (typeof p.id !== 'string' || ids.has(p.id) || typeof p.original !== 'string' || typeof p.translation !== 'string') throw new Error('Invalid paragraph'); ids.add(p.id); }
 const result = structuredClone(input);
 result.schemaVersion = 4;
 result.blocks ??= result.paragraphs.map(p => ({ id: p.id, kind: 'paragraph', original: { text: [{text:p.original}] }, translation: { text: [{text:p.translation}] } }));
 const blockIds = new Set<string>();
 for (const b of allBlocks(result.blocks)) {
  if (!b.id || blockIds.has(b.id) || !['factbox','headline','lead','introduction','paragraph','subheading','image','caption'].includes(b.kind)) throw new Error('Invalid block');
  blockIds.add(b.id);
  if(b.kind==='factbox'&&(!Array.isArray(b.children)||!b.children.length))throw Error('Invalid fact box');
  if(b.children&&b.kind!=='factbox')throw Error('Unexpected block children');
  if(b.factRole&&!['label','title','source','list-item'].includes(b.factRole))throw Error('Invalid fact role');
  for (const c of [b.original,b.translation]) {
   if (!c || !Array.isArray(c.text)) throw new Error('Invalid block content');
   for (const span of [...c.text,...(c.caption ?? [])]) if (typeof span.text !== 'string' || (span.href !== undefined && typeof span.href !== 'string') || (span.marks && span.marks.some(m => !['bold','italic','underline','code'].includes(m)))) throw new Error('Invalid inline content');
   if (c.image && (typeof c.image.src !== 'string' || typeof c.image.alt !== 'string')) throw new Error('Invalid image');
  }
 }
 // The Phase 1 text editor is a compatibility projection. Preserve formatting
 // until a text field is actually changed; preserve all other structured blocks.
 for (const p of result.paragraphs) {
  let b = flattenBlocks(result.blocks).find(b => b.id === p.id);
  if (!b) { b = {id:p.id,kind:'paragraph',original:{text:[]},translation:{text:[]}}; result.blocks.push(b); }
  for (const side of ['original','translation'] as const) if (b[side].text.map(s => s.text).join('') !== p[side]) b[side].text = [{text:p[side]}];
 }
 return result;
}
export class EditorSession {
 project: Project; dirty = false; revision = 0; generation = 0; saving = false;
 constructor(project: Project) { this.project = project; }
 edit(project: Project) { this.project = project; this.revision++; this.dirty = true; }
 open(project: Project, discard: () => boolean): boolean {
  if (this.dirty && !discard()) return false;
  this.project = project; this.dirty = false; this.generation++; return true;
 }
 needsCloseWarning() { return this.dirty || this.saving; }
 acceptExtraction(article: import('./future-services').ExtractedArticle, id: string, discard: () => boolean) {
  const next: Project = {id,title:article.title,url:article.url,schemaVersion:4,updatedAt:'',blocks:structuredClone(article.blocks),paragraphs:flattenBlocks(article.blocks).filter(b=>b.kind!=='image').map(b=>({id:b.id,original:b.original.text.map(s=>s.text).join(''),translation:''}))};
  if (!this.open(next,discard)) return false;
  this.edit(next); return true;
 }
 async save(write: (p: Project) => Promise<Project>, copyId?: string, title = this.project.title) {
  if (this.saving) throw new Error('A save is already in progress.');
  this.saving = true;
  const revision = this.revision, generation = this.generation;
  const snapshot = structuredClone({...this.project, id:copyId ?? this.project.id, title});
  try {
   const saved = await write(snapshot);
   if (this.generation !== generation) return saved;
   if (this.revision === revision) { this.project = saved; this.dirty = false; }
   else if (copyId) this.project = {...this.project, id:copyId, title, updatedAt:saved.updatedAt};
   return saved;
  } finally { this.saving = false; }
 }
}
