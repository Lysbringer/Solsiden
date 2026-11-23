import type { JSONContent } from '@tiptap/core';
import type { Inline } from './project';
import { normalizeProject, flattenBlocks } from './project';
import type { Project } from './types';
export function toRichDocument(spans: Inline[]): JSONContent {
 return {type:'doc',content:[{type:'paragraph',content:spans.flatMap(span=>{
 const marks=[...(span.marks??[]).map(type=>({type})),...(span.href&&/^https?:\/\//i.test(span.href)?[{type:'link',attrs:{href:span.href}}]:[])];
 return span.text.split('\n').flatMap((text,i)=>[...(i?[{type:'hardBreak'}]:[]),...(text?[{type:'text',text,marks}]:[])]);
 })}]};
}
export function fromRichDocument(doc: JSONContent): Inline[] {
 const result:Inline[]=[];
 function visit(node:JSONContent){
  if(node.type==='hardBreak'){result.push({text:'\n'});return;}
  if(node.type==='text'&&node.text){
   const marks=(node.marks??[]).map(m=>m.type).filter(m=>['bold','italic','underline','code'].includes(m)) as NonNullable<Inline['marks']>;
   const href=node.marks?.find(m=>m.type==='link')?.attrs?.href;
   result.push({text:node.text,...(marks.length?{marks}:{}),...(typeof href==='string'&&/^https?:\/\//i.test(href)?{href}:{})});return;
  }
  node.content?.forEach((child,i)=>{if(node.type==='doc'&&i)result.push({text:'\n'});visit(child);});
 }
 visit(doc);return result;
}
export function editorProject(project:Project):Project {
 const next=normalizeProject(project);
 if(!next.blocks!.some(b=>b.kind==='headline'))next.blocks!.unshift({id:next.id+':headline',kind:'headline',original:{text:[{text:next.title}]},translation:{text:[]}});
 return next;
}
export function editBlock(project:Project,id:string,side:'original'|'translation',text:Inline[]):Project {
 const next=editorProject(project);const block=flattenBlocks(next.blocks!).find(b=>b.id===id);
 if(!block)throw Error('Unknown block');
 block[side]={...block[side],text:structuredClone(text)};
 const plain=text.map(s=>s.text).join('');const paragraph=next.paragraphs.find(p=>p.id===id);
 if(paragraph)paragraph[side]=plain;
 else if(block.kind!=='image')next.paragraphs.push({id,original:side==='original'?plain:block.original.text.map(s=>s.text).join(''),translation:side==='translation'?plain:block.translation.text.map(s=>s.text).join('')});
 if(block.kind==='headline'&&side==='original')next.title=plain||'Untitled article';
 return next;
}
