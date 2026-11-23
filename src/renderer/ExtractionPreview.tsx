import React from 'react';
import type { ExtractedArticle } from '../shared/future-services';
import type { ContentBlock, Inline } from '../shared/project';
function Text({spans}:{spans:Inline[]}) {
 return <>{spans.map((span,i)=>{
  let node:React.ReactNode=span.text;
  if(span.marks?.includes('code'))node=<code>{node}</code>;
  if(span.marks?.includes('bold'))node=<strong>{node}</strong>;
  if(span.marks?.includes('italic'))node=<em>{node}</em>;
  if(span.marks?.includes('underline'))node=<u>{node}</u>;
  const href=span.href&&/^https?:\/\//i.test(span.href)?span.href:undefined;
  return <React.Fragment key={i}>{href?<a href={href} title={href} onClick={e=>e.preventDefault()}>{node}</a>:node}</React.Fragment>;
 })}</>;
}
export function PreviewImage({src,alt}:{src:string;alt:string}) {
 const [data,setData]=React.useState<string>();const [failed,setFailed]=React.useState(false);
 return <figure className="preview-image">{data?<img src={data} alt={alt}/>:<div><p>{alt||'Article image'}</p><button disabled={failed} onClick={()=>window.desktop.previewImage(src).then(setData).catch(()=>setFailed(true))}>{failed?'Image unavailable':'Load image'}</button></div>}</figure>;
}
function PreviewBlock({block}:{block:ContentBlock}) {
 const text=<Text spans={block.original.text}/>;
 if(block.kind==='factbox')return <section className="preview-factbox" aria-label="Editorial fact box">{block.children?.map(child=><PreviewBlock key={child.id} block={child}/>)}</section>;
 const role=block.factRole?'fact-'+block.factRole:'';
 if(block.kind==='headline')return <h1>{text}</h1>;
 if(block.kind==='lead')return <p className="standfirst">{text}</p>;
 if(block.kind==='subheading')return <h2 className={role}>{text}</h2>;
 if(block.kind==='image')return block.original.image?<PreviewImage {...block.original.image}/>:null;
 if(block.factRole==='list-item')return <p className={role}><span aria-hidden="true">{block.listStyle==='ordered'?(block.ordinal??1)+'. ':'\u2022 '}</span>{text}</p>;
 return <p className={role||(block.kind==='caption'?'photo-caption':'')}>{text}</p>;
}
export function ExtractionPreview({article,onAccept,onCancel}:{article:ExtractedArticle;onAccept:()=>void;onCancel:()=>void}) {
 return <div className="overlay"><section className="extraction-preview" role="dialog" aria-modal="true" aria-label="Extraction preview"><div className="preview-toolbar"><span>Article preview: {new URL(article.url).hostname}</span><div className="actions"><button onClick={onCancel}>Cancel</button><button className="new" onClick={onAccept}>Accept article</button></div></div><div className="preview-scroll"><article className="newspaper">{article.warnings.map((warning,i)=><p className="preview-warning" key={i} role="alert">{warning}</p>)}{article.blocks.map(block=><PreviewBlock key={block.id} block={block}/>)}</article></div></section></div>;
}
