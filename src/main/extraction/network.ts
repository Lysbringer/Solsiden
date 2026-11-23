import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { request as httpRequest, type IncomingHttpHeaders } from 'node:http';
import { isIP } from 'node:net';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';
export const MAX_BYTES = 5 * 1024 * 1024;
export function validateURL(value: string): URL {
 const url = new URL(value);
 if (!['https:','http:'].includes(url.protocol) || url.username || url.password || !['','80','443'].includes(url.port)) throw Error('Use a public HTTP or HTTPS URL without credentials or custom ports.');
 return url;
}
function publicAddress(ip: string) {
 if (isIP(ip) === 4) { const [a,b] = ip.split('.').map(Number); return !(a===0 || a===10 || a===127 || a===169&&b===254 || a===172&&b>=16&&b<=31 || a===192&&b===168 || a===100&&b>=64&&b<=127 || a>=224 || a===198&&(b===18||b===19)); }
 return isIP(ip)===6 && /^[23]/.test(ip) && !ip.toLowerCase().startsWith('2001:db8');
}
export interface DownloadOptions { followRedirects?: boolean; headers?: Record<string,string> }
export interface DownloadResult { body: Buffer; url: string; type: string; status: number; headers: IncomingHttpHeaders }
// Node's autoSelectFamily requests lookup({all:true}); its callback requires
// an array in that mode. Never perform a second, unvalidated DNS resolution.
export function pinnedLookup(addresses: {address:string;family:number}[]) {
 return (_host: string, options: {all?:boolean}, callback: (...args:any[])=>void) => {
  if(options.all) callback(null, addresses);
  else callback(null, addresses[0].address, addresses[0].family);
 };
}
export async function download(value: string, redirects = 0, options: DownloadOptions = {}): Promise<DownloadResult> {
 const url = validateURL(value);
 let addresses;
 try { addresses = await lookup(url.hostname.replace(/^\[|\]$/g,''), {all:true}); }
 catch(error) { throw Error(`DNS lookup failed for ${url.hostname}: ${(error as NodeJS.ErrnoException).code ?? String(error)}`); }
 if (!addresses.length || addresses.some(a=>!publicAddress(a.address))) throw Error('Local and private network addresses are not allowed.');
 return new Promise((resolve,reject)=>{
  const headers: Record<string,string> = {'User-Agent':'BokmalDesk/0.2 (article reader)','Accept':'text/html,application/xhtml+xml,*/*;q=0.5','Accept-Encoding':'gzip, deflate, br'};
  for (const [name,value] of Object.entries(options.headers??{})) if (['user-agent','accept','accept-language','referer','cookie'].includes(name.toLowerCase())) headers[name.toLowerCase()]=value;
  // Avoid duplicate differently-cased headers when forwarding browser metadata.
  for (const name of ['User-Agent','Accept']) if(headers[name.toLowerCase()])delete headers[name];
  const req=(url.protocol==='https:'?request:httpRequest)(url,{lookup:pinnedLookup(addresses) as any,headers},res=>{
   const status=res.statusCode??0;
   if ([301,302,303,307,308].includes(status) && res.headers.location && options.followRedirects !== false) {
    res.destroy(); if(redirects>=5) reject(Error('Too many redirects.'));
    else { const next = new URL(res.headers.location,url); const nextHeaders={...options.headers}; if(next.origin!==url.origin)for(const key of Object.keys(nextHeaders))if(['cookie','referer'].includes(key.toLowerCase()))delete nextHeaders[key]; download(next.href,redirects+1,{...options,headers:nextHeaders}).then(resolve,reject); } return;
   }
   if(status<200||status>=400){res.resume();reject(Error(`Website returned HTTP ${status} for ${url.hostname}. Access restrictions will not be bypassed.`));return;}
   const encoding=String(res.headers['content-encoding']??'').toLowerCase();
   const decoder=encoding==='gzip'?createGunzip():encoding==='br'?createBrotliDecompress():encoding==='deflate'?createInflate():undefined;
   if(encoding && encoding!=='identity' && !decoder){res.destroy();reject(Error(`Unsupported response compression: ${encoding}`));return;}
   let wireSize=0,size=0;const chunks:Buffer[]=[];
   const fail=(error:Error)=>{res.destroy();decoder?.destroy();req.destroy();reject(error);};
   res.on('data',(chunk:Buffer)=>{wireSize+=chunk.length;if(wireSize>MAX_BYTES)fail(Error('Response exceeds the 5 MB limit.'));});
   const body=decoder?res.pipe(decoder):res;
   body.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>MAX_BYTES){fail(Error('Decoded response exceeds the 5 MB limit.'));return;}chunks.push(chunk);});
   body.on('end',()=>resolve({body:Buffer.concat(chunks),url:url.href,type:String(res.headers['content-type']??''),status,headers:res.headers}));
   body.on('error',error=>fail(Error(`Response decoding failed: ${error.message}`)));res.on('aborted',()=>fail(Error('Website closed the response before it completed.')));res.on('error',reject);
  });
  const timer=setTimeout(()=>req.destroy(Error('Website request timed out (15 seconds).')),15000);
  req.on('close',()=>clearTimeout(timer));req.on('error',error=>reject(Error(`Request to ${url.hostname} failed: ${(error as NodeJS.ErrnoException).code ?? error.message} (${error.message})`)));req.end();
 });
}
