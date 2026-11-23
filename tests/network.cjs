const {test,mock}=require('node:test');const assert=require('node:assert/strict');const http=require('node:http');const dns=require('node:dns/promises');const zlib=require('node:zlib');const fs=require('node:fs');const path=require('node:path');
const {pinnedLookup,download,MAX_BYTES}=require('../dist-electron/main/extraction/network');
const {extractArticle,renderArticle,extractionError,previewImage}=require('../dist-electron/main/extraction/pipeline');
const html=fs.readFileSync(path.join(__dirname,'fixtures/article.html'),'utf8');
test('pinned lookup honors single-address and all-address Node callback contracts',()=>{const addresses=[{address:'93.184.215.14',family:4},{address:'2606:2800:220:1:248:1893:25c8:1946',family:6}];pinnedLookup(addresses)('example.com',{all:true},(err,result)=>assert.deepEqual(result,addresses));pinnedLookup(addresses)('example.com',{},(err,ip,family)=>{assert.equal(ip,addresses[0].address);assert.equal(family,4)});});
test('real HTTP downloader and production Chromium interception: redirects, cookies, compression and errors',async()=>{
 const server=http.createServer((req,res)=>{
  if(req.url==='/redirect'){res.writeHead(302,{'location':'/cookie','set-cookie':'session=fixture; Path=/; HttpOnly'});return res.end();}
  if(req.url==='/cookie'){if(!req.headers.cookie?.includes('session=fixture')){res.writeHead(401);return res.end();}res.setHeader('content-type','text/html');return res.end(html);}
  if(req.url==='/image'){res.setHeader('content-type','image/png');return res.end(Buffer.from([137,80,78,71,13,10,26,10]));}
  if(req.url==='/svg'){res.setHeader('content-type','image/svg+xml');return res.end('<svg/>');}
  if(req.url==='/denied'){res.writeHead(403);return res.end('Forbidden');}
  if(req.url==='/private'){res.writeHead(302,{location:'http://127.0.0.1/secret'});return res.end();}
  if(req.url==='/huge'){res.setHeader('content-encoding','gzip');return res.end(zlib.gzipSync('x'.repeat(MAX_BYTES+1)));}
  if(req.url==='/shell'){res.setHeader('content-type','text/html');return res.end(`<html><body>Loading<script>document.body.innerHTML=${JSON.stringify(html).replace(/</g,"\\u003c")}</script></body></html>`);}
  res.setHeader('content-type','text/html; charset=utf-8');res.setHeader('content-encoding','gzip');res.end(zlib.gzipSync(html));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;
 const originalLookup=dns.lookup,originalRequest=http.request;
 // Only the test transport is mapped to a loopback fixture server. Production
 // validation still sees a public DNS result and production code is unmodified.
 const lookupMock=mock.method(dns,'lookup',async(host,opts)=>host==='fixture.example'? [{address:'93.184.215.14',family:4}]:originalLookup(host,opts));
 const requestMock=mock.method(http,'request',(url,options,cb)=>{
  if(url.hostname!=='fixture.example')return originalRequest(url,options,cb);
  options.lookup(url.hostname,{all:true},(error,addresses)=>assert.equal(addresses[0].address,'93.184.215.14'));
  const local=new URL(url);local.hostname='127.0.0.1';local.port=String(port);
  return originalRequest(local,{...options,lookup:undefined},cb);
 });
 try{
  assert((await previewImage('http://fixture.example/image')).startsWith('data:image/png;base64,'));
  await assert.rejects(previewImage('http://fixture.example/svg'),/Unsupported image/);
  const direct=await extractArticle('http://fixture.example/article');assert.equal(direct.method,'http');assert(direct.blocks.length>4);
  const redirected=await renderArticle('http://fixture.example/redirect');assert.equal(redirected.url,'http://fixture.example/cookie');assert(redirected.html.includes('Coastal research'));
  const fallback=await extractArticle('http://fixture.example/shell');assert.equal(fallback.method,'browser');assert(fallback.blocks.length>4);
  await assert.rejects(renderArticle('http://fixture.example/denied'),/Browser navigation failed:.*HTTP 403/);
  await assert.rejects(download('http://fixture.example/private'),/private network/);
  await assert.rejects(renderArticle('http://fixture.example/private'),/private network/);
  await assert.rejects(download('http://fixture.example/huge'),/5 MB/);
 }finally{requestMock.mock.restore();lookupMock.mock.restore();await new Promise(resolve=>server.close(resolve));}
});
test('Chromium installation advice appears only for a missing executable',()=>{assert(!extractionError(Error('HTTP 403')).includes('install chromium'));assert(!extractionError(Error('net::ERR_FAILED')).includes('install chromium'));assert(extractionError(Error("Executable doesn't exist at C:/browser")).includes('install chromium'));});
