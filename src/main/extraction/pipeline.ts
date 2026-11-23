import { chromium } from 'playwright';
import { download, MAX_BYTES, validateURL } from './network';
import { extractWithFallback } from './parser';
export function extractionError(error: Error) {
 return `Extraction failed: ${error.message}${/Executable doesn't exist|executable.*not found/i.test(error.message) ? '. Install the missing browser with npx playwright install chromium.' : ''}`;
}
export async function renderArticle(url:string) {
 const browser=await chromium.launch({headless:true,chromiumSandbox:true});
 try {
 const context=await browser.newContext({serviceWorkers:'block',acceptDownloads:false});
 await context.routeWebSocket('**/*', socket => socket.close());
 const page=await context.newPage();page.on('popup', popup => { void popup.close(); });
 let requests=0,total=0;const failures:string[]=[];let navigationError='';let redirectTarget:string|undefined;
 await context.route('**/*',async route=>{
  const request=route.request();
  try{
   if(request.method()!=='GET'||['image','media','font','websocket'].includes(request.resourceType()))return await route.abort();
   if(++requests>80)throw Error('Browser request limit exceeded (80 requests).');
   // Preserve browser headers and cookies. Top-level redirects are replayed
   // explicitly below so each hop gets validated and pinned.
   const response=await download(request.url(),0,{followRedirects:!request.isNavigationRequest(),headers:await request.allHeaders()});
   total+=response.body.length;if(total>15*MAX_BYTES)throw Error('Browser response budget exceeded (75 MB).');
   const headers:Record<string,string>={};
   for(const [key,value] of Object.entries(response.headers))if(value!==undefined&&!['content-encoding','content-length','transfer-encoding','connection'].includes(key))headers[key]=Array.isArray(value)?value.join('\n'):String(value);
   if(response.status>=300&&response.status<400&&response.headers.location){
    if(request.isNavigationRequest()&&request.frame()===page.mainFrame()) {
     redirectTarget=new URL(response.headers.location,request.url()).href;
     // Playwright does not route every hop of a browser redirect chain.
     // Store permitted response cookies, then navigate explicitly so each
     // destination passes through the restricted downloader again.
     delete headers.location;await route.fulfill({status:200,body:'',headers});return;
    }
    throw Error('Unsupported subframe redirect.');
   }
   await route.fulfill({status:response.status,body:response.body,headers});
  }catch(error){
   const detail=`${new URL(request.url()).hostname}: ${(error as Error).message}`;
   failures.push(detail);if(request.isNavigationRequest()&&request.frame()===page.mainFrame())navigationError=detail;
   await route.abort();
  }
 });
 try {
  let destination=url;
  for(let hop=0; ;hop++) {
   if(hop>5)throw Error('Too many browser redirects.');
   redirectTarget=undefined;navigationError='';
   await page.goto(destination,{waitUntil:'domcontentloaded',timeout:20000});
   if(!redirectTarget)break;
   destination=redirectTarget;
  }
 }
 catch(error){throw Error(`Browser navigation failed: ${navigationError || (error as Error).message}`);}
 await page.waitForTimeout(1500);
 const html=await page.content();if(Buffer.byteLength(html)>MAX_BYTES)throw Error('Rendered article exceeds the 5 MB limit.');
 return {html,url:page.url(),failures};
 }finally{await browser.close();}
}
export async function extractArticle(url:string){
 validateURL(url);let warnings:string[]=[];
 const article=await extractWithFallback(url,async()=>{
  const r=await download(url);if(!/text\/html|application\/xhtml\+xml/i.test(r.type))throw Error(`The URL returned ${r.type || 'no content type'}, not an HTML page.`);
  return {html:r.body.toString('utf8'),url:r.url};
 },async()=>{const result=await renderArticle(url);warnings=result.failures;return result;});
 if(warnings.length)article.warnings.push(`Some browser resources failed: ${warnings.slice(0,3).join('; ')}`);
 return article;
}

export async function previewImage(url:string) {
 const response=await download(url);const b=response.body;
 const mime=b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':b[0]===255&&b[1]===216&&b[2]===255?'image/jpeg':b.subarray(0,6).toString().match(/^GIF8[79]a$/)?'image/gif':b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP'?'image/webp':undefined;
 if(!mime)throw Error('Unsupported image format');
 return 'data:'+mime+';base64,'+b.toString('base64');
}
