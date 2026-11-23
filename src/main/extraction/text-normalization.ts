import { decodeHTMLStrict, escapeText } from 'entities';
import type { JSDOM } from 'jsdom';
// Only a complete, non-nested envelope is a CDATA wrapper. Embedded examples,
// partial markers and literal HTML syntax are ordinary text.
export function unwrapCDATA(value:string):string {
 const trimmed=value.trim();
 if(!trimmed.startsWith('<![CDATA[')||!trimmed.endsWith(']]>'))return value;
 const payload=trimmed.slice(9,-3);
 if(payload.includes(']]>')||payload.includes('<![CDATA['))return value;
 const start=value.indexOf(trimmed);
 return value.slice(0,start)+payload+value.slice(start+trimmed.length);
}
export function normalizeRawMetadataText(value:string):string {
 return decodeHTMLStrict(unwrapCDATA(value));
}
// Readability performs its own basic entity pass, followed by a numeric pass.
// Shield text that we already decoded so those passes produce exactly our
// value, including intentional literal entity spellings (e.g. &#39;).
export function protectForReadability(value:string):string {
 return value.replaceAll('&','&amp;').replaceAll('#','&#35;');
}
// Use the HTML parser's source locations to distinguish actual declarations
// from attributes, script strings, regular comments and escaped examples.
export function normalizeCDATADeclarations(dom:JSDOM,sourceHTML:string):string {
 const comments=dom.window.document.createTreeWalker(dom.window.document,128);
 const spans:{start:number;end:number;text:string}[]=[];
 while(comments.nextNode()) {
  const location=dom.nodeLocation(comments.currentNode);if(!location)continue;
  const start=location.startOffset;
  if(!sourceHTML.startsWith('<![CDATA[',start)||spans.some(span=>start<span.end))continue;
  const close=sourceHTML.indexOf(']]>',start+9);if(close<0)continue;
  const raw=sourceHTML.slice(start,close+3);
  if(unwrapCDATA(raw)===raw)continue;
  spans.push({start,end:close+3,text:escapeText(normalizeRawMetadataText(raw))});
 }
 let result=sourceHTML;
 for(const span of spans.reverse())result=result.slice(0,span.start)+span.text+result.slice(span.end);
 return result;
}
export function normalizeExtractionDocument(dom:JSDOM):void {
 const document=dom.window.document;
 const textKeys=new Set(['headline','name','description','alternativeHeadline','caption','text','articleBody']);
 const visit=(value:unknown):void=>{
  if(!value||typeof value!=='object')return;
  for(const [key,child] of Object.entries(value)) {
   if(textKeys.has(key)&&typeof child==='string')(value as Record<string,unknown>)[key]=protectForReadability(normalizeRawMetadataText(child));
   else visit(child);
  }
 };
 for(const script of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
  try{const json:unknown=JSON.parse(unwrapCDATA(script.textContent??''));visit(json);script.textContent=JSON.stringify(json);}catch{/* Leave invalid structured data to Readability's normal fallback. */}
 }
 for(const meta of Array.from(document.querySelectorAll('meta[property$=":title"][content],meta[name$=":title"][content],meta[name="title"][content],meta[name="parsely-title"][content]'))) {
  // Attribute entities have already been decoded by the HTML parser.
  // Decode no further and preserve literal markup spellings in DOM text.
  meta.setAttribute('content',protectForReadability(meta.getAttribute('content')??''));
 }
 const title=document.querySelector('title');if(title)title.textContent=protectForReadability(title.textContent??'');
}
