import React, {useEffect,useRef,useState} from 'react';
import {useEditor,EditorContent} from '@tiptap/react';
import {Extension} from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import type {ContentBlock,Inline} from '../shared/project';
import {flattenBlocks} from '../shared/project';
import {toRichDocument,fromRichDocument} from '../shared/rich-text';
import {Icon} from './ExtractionLoading';
import {PreviewImage} from './ExtractionPreview';
import {DeepLPanel} from './DeepLPanel';
import {ContextHeadline} from './ContextHeadline';

const AlignedBlock=Extension.create({name:'alignedBlock',addKeyboardShortcuts(){return {Enter:()=>this.editor.commands.setHardBreak()};}});
function BlockEditor({block,side,onEdit,children}:{block:ContentBlock;side:'original'|'translation';onEdit:(id:string,side:'original'|'translation',text:Inline[])=>void;children?:React.ReactNode}) {
 const latest=useRef(onEdit);latest.current=onEdit;
 const editor=useEditor({extensions:[StarterKit.configure({heading:false,bulletList:false,orderedList:false,listItem:false,listKeymap:false,blockquote:false,codeBlock:false,horizontalRule:false,link:{openOnClick:false,protocols:['http','https'],autolink:false}}),AlignedBlock],content:toRichDocument(block[side].text),editorProps:{attributes:{role:'textbox','aria-label':`${side} ${block.kind}`,'data-placeholder':side==='translation'?'Write Norwegian…':'Write English…'},handleClick:(_view,_pos,event)=>{if((event.target as Element).closest('a')){event.preventDefault();return true;}return false;}},onUpdate:({editor})=>latest.current(block.id,side,fromRichDocument(editor.getJSON()))},[]);
 useEffect(()=>{if(editor&&JSON.stringify(fromRichDocument(editor.getJSON()))!==JSON.stringify(block[side].text))editor.commands.setContent(toRichDocument(block[side].text),{emitUpdate:false});},[editor,block,side]);
 return <div className={`article-cell block-${block.kind} ${block.factRole ? "fact-"+block.factRole : ""}`} data-list-marker={block.factRole==='list-item' ? (block.listStyle==='ordered' ? (block.ordinal??1)+'.' : '\u2022') : undefined}>
  <EditorContent editor={editor}/>
  {children}
 </div>;
}
export function ArticleEditor({blocks,sessionKey,onEdit,onAdd}:{blocks:ContentBlock[];sessionKey:string;onEdit:(id:string,side:'original'|'translation',text:Inline[])=>void;onAdd:()=>void}) {
 const workspace = useRef<HTMLElement>(null);
 const [deepL, setDeepL] = useState<{session: string; id: string; source: string; scroll: number}>();
 const [split, setSplit] = useState(40);
 const activeBlock = deepL?.session === sessionKey ? flattenBlocks(blocks).find(block => block.id === deepL.id) : undefined;
 const activeId = activeBlock?.id;
 function setDivider(percent: number) { setSplit(Math.min(80, Math.max(20, percent))); }
 function closeDeepL() {
  const scroll = deepL?.scroll ?? 0;
  setDeepL(undefined);
  requestAnimationFrame(() => {
   const editor = workspace.current;
   if (editor && !editor.classList.contains('deepl-split')) editor.scrollTop = scroll;
  });
 }
 const headlineContext = blocks.filter(block => ['lead', 'introduction', 'paragraph'].includes(block.kind))
  .map(block => block.original.text.map(span => span.text).join('').trim()).filter(Boolean).slice(0, 4).join('\n\n').slice(0, 6000);
 const render=(block:ContentBlock):React.ReactNode=>{
  if(block.kind==='factbox')return <section className="editor-factbox" aria-label="Editorial fact box" data-block-id={block.id} key={block.id}>{block.children?.map(render)}</section>;
  if(block.kind==='image')return <div className="aligned-row image-row" key={block.id}>{block.original.image&&<div className="shared-image"><PreviewImage {...block.original.image}/></div>}</div>;
  const source = block.original.text.map(span => span.text).join('');
  const open = activeId === block.id;
  return <div className={'aligned-row' + (open ? ' deepl-active-row' : '')} data-block-id={block.id} key={block.id}>
   <BlockEditor block={block} side="original" onEdit={onEdit}/>
   <BlockEditor block={block} side="translation" onEdit={onEdit}>
    {block.kind === 'headline' && source.trim() && source !== 'Untitled article' && headlineContext &&
     <ContextHeadline headline={block.original.text} context={headlineContext} onAccept={text => onEdit(block.id, 'translation', text)}/>}
   </BlockEditor>
   {!activeId && source.trim() &&
    <button type="button" className="deepl-action-bar deepl-row-trigger" onClick={() =>
     setDeepL({session:sessionKey,id:block.id,source,scroll:workspace.current?.scrollTop ?? 0})}>Open in DeepL</button>}
  </div>;
 };
 return <section ref={workspace} className={'workspace article-editor' + (activeId ? ' deepl-split' : '')} aria-label="Aligned article editor"
  style={activeId ? {gridTemplateRows: `minmax(0, ${split}fr) 10px minmax(0, ${100 - split}fr)`} : undefined}>
  <div key={sessionKey} className="article-rows" role={activeId ? 'region' : undefined} aria-label={activeId ? 'Active paragraph' : undefined}>{blocks.map(render)}</div>
  {activeId ? <>
   <div className="deepl-split-divider" role="separator" aria-label="Resize article and DeepL panes" aria-orientation="horizontal"
    aria-valuemin={20} aria-valuemax={80} aria-valuenow={Math.round(split)} tabIndex={0}
    onPointerDown={event => { if (event.button === 0) { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); } }}
    onPointerMove={event => {
     if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
     const bounds = workspace.current!.getBoundingClientRect();
     setDivider((event.clientY - bounds.top - 5) / (bounds.height - 10) * 100);
    }}
    onKeyDown={event => {
     if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      setDivider(split + (event.key === 'ArrowDown' ? 5 : -5));
     }
    }}/>
   <DeepLPanel key={activeId} source={deepL!.source} onClose={closeDeepL}
    formatted={!!activeBlock?.translation.text.some(span => span.href || span.marks?.length)}
    onAccept={text => onEdit(activeId, 'translation', [{ text }])}/>
  </> : <button className="add" onClick={onAdd}><Icon name="plus"/> Add aligned paragraph</button>}
 </section>;
}
