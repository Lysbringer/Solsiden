import { normalizeExtractionDocument, normalizeCDATADeclarations } from './text-normalization';
import { captureFacts, factBlock } from './factbox';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import { createHash } from 'node:crypto';
import type { ContentBlock, Inline } from '../../shared/project';
import type { ExtractedArticle } from '../../shared/future-services';
export function safeURL(value: string, base: string) { try { const u=new URL(value,base); return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password ? u.href : undefined; } catch { return undefined; } }
export function parseArticle(html:string,url:string): ExtractedArticle {
 let dom=new JSDOM(html,{url,includeNodeLocations:true});
 try {
 const repairedHTML=normalizeCDATADeclarations(dom,html);
 if(repairedHTML!==html){dom.window.close();dom=new JSDOM(repairedHTML,{url,includeNodeLocations:true});}
 normalizeExtractionDocument(dom);
 const source=dom.window.document;
 Array.from(source.querySelectorAll('*')).forEach((el,i)=>el.setAttribute('data-bd-order',String(i)));
 const facts=captureFacts(source);
 for(const fact of facts){const original=source.querySelector('[data-bd-order="'+fact.order+'"]');if(original){const marker=source.createElement('p');marker.setAttribute('data-bd-order',String(fact.order));marker.setAttribute('data-bd-fact',fact.id);marker.textContent='BOKMAL_FACT_'+fact.id;original.replaceWith(marker);}}
 const warnings:string[]=[];
 for(const note of Array.from(source.querySelectorAll('article [role="note"], article [data-component="factbox"], article .factbox, article .fact-box'))) {
  if(note.textContent?.trim()&&!note.closest('nav,.advertisement,.related-articles'))warnings.push('An editorial note could not be classified safely and was not imported; review the source article.');
 }

 if (source.querySelector('[class*="paywall"], [id*="paywall"], [class*="subscription-required"]') || /"isAccessibleForFree"\s*:\s*(?:false|"false")/.test(html)) throw Error('This page indicates restricted access. Open a publicly accessible article.');
 if(new URL(url).hostname.endsWith('epochtimes.se'))for(const heading of Array.from(source.querySelectorAll('h2')))if(heading.textContent?.trim().startsWith('Kvalitetsjournalistik')&&heading.parentElement?.classList.contains('print:hidden'))heading.parentElement.remove();
 // Capture visible standfirsts before Readability discards the article header.
 const headline=source.querySelector('h1');
 const scope=headline?.closest('article') ?? headline?.parentElement?.parentElement;
 const leadSelectors='[data-testid="article-excerpt"], [itemprop="alternativeHeadline"], .standfirst, .article-standfirst, .article__standfirst, .article-lead, .article__lead, .article-ingress, .ingress, .article-subtitle, .article__subtitle, [data-component="standfirst"]';
 let lead=scope?.querySelector(leadSelectors)?.cloneNode(true) as Element | undefined;
 // Description metadata is evidence only when matching visible header text.
 // A generic SEO summary must not become an invented lead.
 if(!lead&&headline){
  const description=source.querySelector('meta[name="description"],meta[property="og:description"]')?.getAttribute('content')?.trim();
  const sibling=headline.nextElementSibling;
  if(description&&sibling&&sibling.textContent?.trim()===description)lead=sibling.cloneNode(true) as Element;
 }
 const hero=scope?.querySelector('figure[data-testid="top-media"],figure.article-hero,figure.article__hero')?.cloneNode(true) as Element | undefined;
 for(const el of Array.from(source.querySelectorAll('nav,aside,[role="navigation"], [data-testid="shortcode_related_article"], [id="in_article_related_stories"], .related-articles, .related-stories, .advertisement, [data-ad], [data-testid="post-default-social-buttons"]')))el.remove();
 // Readability wraps bare text runs of DIV paragraphs in separate P elements,
 // splitting around links. Give text-only paragraph containers semantic P tags
 // before it performs that transformation.
 for(const div of Array.from(source.querySelectorAll('div'))) {
  if(div.textContent?.trim()&&!div.querySelector('div,p,h1,h2,h3,h4,h5,h6,figure,img,ul,ol,table,section,article,nav,aside,button,form')){
   const paragraph=source.createElement('p');for(const attr of Array.from(div.attributes))paragraph.setAttribute(attr.name,attr.value);
   while(div.firstChild)paragraph.appendChild(div.firstChild);div.replaceWith(paragraph);
  }
 }
 const article=new Readability(source,{charThreshold:100}).parse();
 if(!article?.content) throw Error('No readable article was found.');
 const contentDom=new JSDOM(article.content);
 const content=contentDom.window.document;
 const blocks:ContentBlock[]=[];const positions=new Map<string,number>();let currentOrder=-1;
 const inline=(node:Node,marks:NonNullable<Inline['marks']>=[],href?:string):Inline[]=>{
  if(node.nodeType===3) return [{text:node.textContent??'',...(marks.length?{marks}:{}),...(href?{href}:{})}];
  if(node.nodeType!==1) return [];
  const el=node as Element;const tag=el.tagName.toLowerCase();
  if(['script','style','iframe','object','form','button','input','svg'].includes(tag))return [];
  const mark=({b:'bold',strong:'bold',i:'italic',em:'italic',u:'underline',code:'code'} as const)[tag as 'b'];
  return Array.from(el.childNodes).flatMap(n=>inline(n,mark?[...marks,mark]:marks,tag==='a'?safeURL(el.getAttribute('href')??'',url):href));
 };
 const add=(kind:ContentBlock['kind'],text:Inline[],image?:{src:string;alt:string})=>{const original={text,...(image?{image}:{})};const id=createHash('sha256').update(JSON.stringify([url,blocks.length,kind,original])).digest('hex').slice(0,24);blocks.push({id,kind,original,translation:{text:[]}});positions.set(id,currentOrder);};
 add('headline',[{text:article.title||'Untitled article'}]);
 const leadText=lead?.textContent?.trim();
 if(lead&&leadText)add('lead',inline(lead));
 if(hero&&!content.querySelector('figure[data-testid="top-media"]'))content.body.prepend(content.importNode(hero,true));
 const handled=new Set<string>();
 const insertFact=(fact:typeof facts[number])=>{const parsed=factBlock(fact,inline,url);blocks.push(parsed.block);positions.set(parsed.block.id,fact.order);warnings.push(...parsed.warnings);handled.add(fact.id);};
 const walk=(el:Element)=>{
  currentOrder=Number(el.closest('[data-bd-order]')?.getAttribute('data-bd-order')??-1);
  const fact=facts.find(f=>el.getAttribute('data-bd-fact')===f.id||el.textContent?.trim()==='BOKMAL_FACT_'+f.id);
  if(fact){if(!handled.has(fact.id))insertFact(fact);return;}
  const tag=el.tagName.toLowerCase();
  if(['script','style','iframe','object','form','svg'].includes(tag))return;
  if(tag==='img'){const raw=el.getAttribute('src')||el.getAttribute('data-src');const src=raw?safeURL(raw,url):undefined;if(src)add('image',[],{src,alt:el.getAttribute('alt')??''});return;}
  if(['p','h1','h2','h3','h4','h5','h6','figcaption','li','blockquote'].includes(tag)&&!el.querySelector('p,h1,h2,h3,h4,h5,h6,figure,img,figcaption,li')) {
   const text=inline(el);if(!text.map(s=>s.text).join('').trim())return;
   if(leadText&&text.map(s=>s.text).join('').trim()===leadText)return;
   if(tag==='h1'&&text.map(s=>s.text).join('').trim()===article.title)return;
   const kind=tag==='figcaption'?'caption':/^h\d$/.test(tag)?'subheading':'paragraph';
   add(kind,text);return;
  }
  let pending:Inline[]=[];
  const flush=()=>{if(pending.map(s=>s.text).join('').trim()){add('paragraph',pending);}pending=[];};
  for(const child of Array.from(el.childNodes)) {
   if(child.nodeType===1 && ((child as Element).matches('p,h1,h2,h3,h4,h5,h6,figure,img,figcaption,div,section,article,li,blockquote,ul,ol') || (child as Element).querySelector('img,p,figure'))) {flush();walk(child as Element);}
   else pending.push(...inline(child));
  }
  flush();
 };
 walk(content.body);
 for(const fact of facts.filter(f=>!handled.has(f.id))){
  if(handled.has(fact.id))continue;handled.add(fact.id);
  const parsed=factBlock(fact,inline,url);const next=blocks.findIndex(b=>(positions.get(b.id)??-1)>fact.order);
  const hasPrevious=blocks.some(b=>(positions.get(b.id)??-1)>=0&&(positions.get(b.id)??-1)<fact.order);
  if(next<0&&!hasPrevious)throw Error('An editorial fact box could not be positioned safely. Review the source article.');
  blocks.splice(next<0?blocks.length:next,0,parsed.block);warnings.push(...parsed.warnings);
 }
 contentDom.window.close();
 return {title:article.title||'Untitled article',url,blocks,method:'http',warnings};
 } finally { dom.window.close(); }
}
export function incomplete(article:ExtractedArticle) {return article.blocks.filter(b=>b.kind==='paragraph'||b.kind==='introduction').reduce((n,b)=>n+b.original.text.map(s=>s.text).join('').length,0)<300;}
export async function extractWithFallback(url:string,load:()=>Promise<string | {html:string;url:string}>,render:()=>Promise<string | {html:string;url:string}>):Promise<ExtractedArticle>{
 let first:ExtractedArticle|undefined;let directError:unknown;
 const parse = (value: string | {html:string;url:string}) => typeof value === 'string' ? parseArticle(value,url) : parseArticle(value.html,value.url);
 try{first=parse(await load());}catch(error){directError=error;if(/restricted access|HTTP \d{3}|private network|public HTTP/.test(String(error)))throw error;}
 if(first&&!incomplete(first))return first;
 let result:ExtractedArticle;
 try{result=parse(await render());}catch(error){throw Error(`Direct extraction: ${directError ? (directError as Error).message : 'readable content was shorter than 300 characters'}. Browser fallback: ${(error as Error).message}`);}
 result.method='browser';
 if(incomplete(result))result.warnings.push('The article may be short or incomplete. Review the extracted content before accepting.');
 return result;
}
