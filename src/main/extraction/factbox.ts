import type {ContentBlock,Inline} from '../../shared/project';
import {createHash} from 'node:crypto';
export interface CapturedFact { id:string; order:number; element:Element; label?:string }
export function captureFacts(document:Document):CapturedFact[] {
 const candidates=new Set<Element>();
 for(const el of Array.from(document.querySelectorAll('[data-component="factbox"], [data-testid="factbox"], [role="note"], aside, .factbox, .fact-box, .factbox-content, .fact-box-content'))) {
  const box=el.matches('.factbox-content,.fact-box-content')?el.parentElement:el;
  if(!box||!box.closest('article,[itemprop="articleBody"]')||box.closest('nav,[role="navigation"],.related-articles,.related-stories,.advertisement,[data-ad]'))continue;
  const heading=box.querySelector('h1,h2,h3,h4,h5,h6,[role="heading"]');
  const paragraphs=box.querySelectorAll('p,li');
  // An arbitrary sidebar is not editorial. Require a fact-component signal,
  // or a semantic note with a heading, prose and a source/citation.
  const explicit=box.matches('.factbox,.fact-box,[data-component="factbox"],[data-testid="factbox"]')||!!box.querySelector('.factbox-content,.fact-box-content');
  const semantic=box.getAttribute('role')==='note'&&!!box.querySelector('cite,[itemprop="citation"]');
  if((!explicit&&(!heading||paragraphs.length<2||!semantic))||(explicit&&(!box.textContent?.trim()||!box.querySelector('p,li,table'))))continue;
  candidates.add(box);
 }
 return [...candidates].filter(el=>![...candidates].some(other=>other!==el&&other.contains(el))).map(element=>{
  const order=Number(element.getAttribute('data-bd-order'));
  const heading=element.querySelector('h1,h2,h3,h4,h5,h6');
  const cssLabel=heading?.getAttribute('class')?.match(/before:content-\[["']([^"']+)["']\]/)?.[1];
  return {id:'fact-'+createHash('sha256').update(element.textContent??'').digest('hex').slice(0,20),order,element:element.cloneNode(true) as Element,label:cssLabel};
 });
}
export function factBlock(fact:CapturedFact,inline:(node:Node)=>Inline[],url:string):{block:ContentBlock;warnings:string[]} {
 const children:ContentBlock[]=[];const warnings:string[]=[];
 const add=(kind:ContentBlock['kind'],text:Inline[],role?:ContentBlock['factRole'],listStyle?:ContentBlock['listStyle'],ordinal?:number)=>{
  if(!text.map(s=>s.text).join('').trim())return;
  children.push({id:fact.id+'-'+children.length,kind,original:{text},translation:{text:[]},...(role?{factRole:role}:{}),...(listStyle?{listStyle,ordinal}:{})});
 };
 if(fact.label)add('caption',[{text:fact.label}],'label');
 const walk=(el:Element)=>{
  if(el.matches('script,style,nav,button,form,.advertisement,.related-articles'))return;
  if(el.matches('h1,h2,h3,h4,h5,h6,[role="heading"]')){add('subheading',inline(el),'title');return;}
  if(el.matches('[data-fact-label],.factbox-label,.fact-box-label')){add('caption',inline(el),'label');return;}
  if(el.matches('li')){
   const copy=el.cloneNode(true) as Element;copy.querySelectorAll('ul,ol').forEach(n=>n.remove());
   const ordered=el.parentElement?.tagName==='OL';
   add('paragraph',inline(copy),'list-item',ordered?'ordered':'unordered',Array.from(el.parentElement?.children??[]).indexOf(el)+Number(el.parentElement?.getAttribute('start')??1));
   for(const list of Array.from(el.children).filter(e=>e.matches('ul,ol')))walk(list);return;
  }
  if(el.matches('p,cite')||!el.children.length){add(el.matches('.factbox-source,.fact-box-source,cite,[itemprop="citation"]')?'caption':'paragraph',inline(el),el.matches('.factbox-source,.fact-box-source,cite,[itemprop="citation"]')?'source':undefined);return;}
  let pending:Inline[]=[];const flush=()=>{add('paragraph',pending);pending=[];};
  for(const child of Array.from(el.childNodes)){
   if(child.nodeType===1&&(child as Element).matches('div,section,aside,p,h1,h2,h3,h4,h5,h6,ul,ol,li,cite,table,figure')){flush();walk(child as Element);}else pending.push(...inline(child));
  }flush();
  if(el.matches('table,figure'))warnings.push('A fact-box component was retained as text; review its layout.');
 };
 walk(fact.element);
 const id=createHash('sha256').update(url+fact.id+fact.order).digest('hex').slice(0,24);
 children.forEach((c,i)=>c.id=id+'-'+i);
 return {block:{id,kind:'factbox',original:{text:[]},translation:{text:[]},children},warnings};
}
