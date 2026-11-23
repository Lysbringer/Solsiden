import React,{useEffect,useState} from 'react';
import type {Project} from '../shared/types';
import {TrashIcon} from './DeleteArticleDialog';
export function ArticleLibrary({articles,activeId,draft,query,busy,onOpen,onDelete}:{articles:Project[];activeId:string;draft?:Project;query:string;busy:boolean;onOpen:(p:Project)=>void;onDelete:(p:Project[])=>void}) {
 const [selected,setSelected]=useState<Set<string>>(new Set());const [anchor,setAnchor]=useState<string>();
 const visible=articles.filter(p=>p.title.toLowerCase().includes(query.toLowerCase())).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||a.id.localeCompare(b.id));
 // Selection is scoped to the visible library; hidden/deleted rows cannot be
 // silently included in a later destructive action.
 useEffect(()=>{const ids=new Set(visible.map(p=>p.id));setSelected(old=>new Set([...old].filter(id=>ids.has(id))));if(anchor&&!ids.has(anchor))setAnchor(undefined);},[articles,query]);
 function select(id:string,range:boolean){setSelected(old=>{if(range&&anchor){const a=visible.findIndex(p=>p.id===anchor),b=visible.findIndex(p=>p.id===id);if(a>=0&&b>=0)return new Set(visible.slice(Math.min(a,b),Math.max(a,b)+1).map(p=>p.id));}const next=new Set(old);next.has(id)?next.delete(id):next.add(id);return next;});if(!range||!anchor)setAnchor(id);}
 const chosen=visible.filter(p=>selected.has(p.id));
 return <div className="library" role="region" aria-label="Article library" tabIndex={0} onKeyDown={event=>{
  if(event.key==='Escape'){setSelected(new Set());setAnchor(undefined);event.preventDefault();}
  if(event.ctrlKey&&event.key.toLowerCase()==='a'){event.preventDefault();setSelected(new Set(visible.map(p=>p.id)));}
 }}>{chosen.length>0&&<div className="library-selection-bar"><strong>{chosen.length} selected</strong><button disabled={busy} onClick={()=>onDelete(chosen)}>Delete selected</button><button aria-label="Clear selection" onClick={()=>{setSelected(new Set());setAnchor(undefined);}}>Clear</button></div>}{draft&&<div className="selected article library-draft" aria-current="true"><strong>{draft.title || "Untitled article"}</strong><small>Unsaved draft</small></div>}{visible.map(p=><div className={'library-item'+(selected.has(p.id)?' multi-selected':'')} key={p.id}><input type="checkbox" aria-label={'Select '+p.title} checked={selected.has(p.id)} onClick={event=>{event.stopPropagation();select(p.id,event.shiftKey);}} onChange={()=>{}}/><button className={p.id===activeId?'selected article':'article'} aria-current={p.id===activeId?'true':undefined} onClick={event=>{if(event.ctrlKey||event.shiftKey){select(p.id,event.shiftKey);return;}setAnchor(p.id);onOpen(p);}}><strong>{p.title}</strong><small>{new Date(p.updatedAt).toLocaleDateString()}</small></button><button className="delete-action" aria-label={'Delete '+p.title} title={'Delete '+p.title} disabled={busy} onClick={()=>onDelete([p])}><TrashIcon/></button></div>) }{!articles.length&&<p className="empty">Saved projects will appear here.<br/>Save your first article to get started.</p>}</div>;
}
