const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const {parseArticle,extractWithFallback}=require('../dist-electron/main/extraction/parser');
const {validateURL,download}=require('../dist-electron/main/extraction/network');
const html=fs.readFileSync(path.join(__dirname,'fixtures/article.html'),'utf8');const shell=fs.readFileSync(path.join(__dirname,'fixtures/shell.html'),'utf8');const url='https://example.com/news';
test('structured reading order, formatting, links and images are sanitized',()=>{const a=parseArticle(html,url);assert.deepEqual(a.blocks.map(b=>b.kind),['headline','paragraph','subheading','paragraph','image','caption','paragraph','paragraph']);assert.equal(a.blocks.find(b=>b.kind==='image').original.image.src,'https://example.com/photo.jpg');assert(a.blocks.some(b=>b.original.text.some(s=>s.href==='https://example.com/report')));assert(a.blocks.some(b=>b.original.text.some(s=>s.marks?.includes('bold'))));assert(!JSON.stringify(a).includes('javascript:'));assert(!JSON.stringify(a).includes('alert('));assert(a.blocks.every(b=>b.translation.text.length===0));assert.deepEqual(a.blocks.map(b=>b.id),parseArticle(html,url).blocks.map(b=>b.id));});
test('complete direct article does not launch fallback',async()=>{const result=await extractWithFallback(url,async()=>html,async()=>{throw Error('should not run')});assert.equal(result.method,'http');});
test('JavaScript shell triggers fallback with representative rendered fixture',async()=>{let calls=0;const result=await extractWithFallback(url,async()=>shell,async()=>{calls++;return html});assert.equal(calls,1);assert.equal(result.method,'browser');assert(result.blocks.length>4);});
test('restricted pages do not trigger fallback',async()=>{await assert.rejects(extractWithFallback(url,async()=>'<div class="paywall">Subscribe</div>',async()=>{throw Error('must not run')}),/restricted access/);});
test('URL policy rejects unsafe schemes credentials ports and private destinations',async()=>{for(const u of ['file:///C:/a','javascript:alert(1)','https://user:pass@example.com','https://example.com:8080'])assert.throws(()=>validateURL(u));await assert.rejects(download('http://127.0.0.1'),/private network/);});
test('failed fallback returns an actionable error',async()=>{await assert.rejects(extractWithFallback(url,async()=>shell,async()=>{throw Error('Browser unavailable')}),/Browser unavailable/);});

test('actual Chromium executes a JavaScript-rendered article fixture',async()=>{const {chromium}=require('playwright');const browser=await chromium.launch({headless:true,chromiumSandbox:true});try{const page=await browser.newPage();const result=await extractWithFallback(url,async()=>shell,async()=>{await page.setContent(shell);await page.evaluate(markup=>{document.body.innerHTML=markup},html);return page.content()});assert.equal(result.method,'browser');assert(result.blocks.some(b=>b.kind==='image'));}finally{await browser.close();}});

test('preview acceptance protects dirty work, aligns blocks and never saves',()=>{const {EditorSession}=require('../dist-electron/shared/project');const old={id:'old',title:'Old',url:'',updatedAt:'',paragraphs:[]};const session=new EditorSession(old);session.edit(old);const extracted=parseArticle(html,url);assert.equal(session.acceptExtraction(extracted,'new',()=>false),false);assert.equal(session.project.id,'old');assert.equal(session.acceptExtraction(extracted,'new',()=>true),true);assert.equal(session.dirty,true);assert.equal(session.project.updatedAt,'');assert(session.project.blocks.every(b=>b.translation.text.length===0));assert(session.project.paragraphs.every(p=>session.project.blocks.some(b=>b.id===p.id)));});
test('close warning reads current state during save and after later edits',async()=>{const {EditorSession}=require('../dist-electron/shared/project');const session=new EditorSession({id:'a',title:'A',url:'',updatedAt:'',paragraphs:[]});let finish;const pending=session.save(p=>new Promise(resolve=>finish=()=>resolve(p)));assert.equal(session.needsCloseWarning(),true);session.edit({...session.project,title:'Later'});finish();await pending;assert.equal(session.needsCloseWarning(),true);});

test('DIV paragraphs retain links, formatting and complete text in one block',()=>{
 const paragraph='Before <a href="/report"><strong>linked bold text</strong></a> between <em>italic text</em> and <a href="/other">another link</a> after.';
 const result=parseArticle(html.replace('<p>The report includes',`<div class="my-5">${paragraph}</div><p>The report includes`),url);
 const block=result.blocks.find(b=>b.original.text.some(s=>s.text==='Before '));assert(block);assert.equal(block.kind,'paragraph');assert.equal(block.original.text.map(s=>s.text).join(''),'Before linked bold text between italic text and another link after.');assert.equal(block.original.text.filter(s=>s.href).length,2);
});
test('publisher standfirst is separate from first body paragraph without duplication',()=>{
 const result=parseArticle(html.replace('</h1>','</h1><div data-testid="article-excerpt">A distinct standfirst.</div>'),url);
 assert.equal(result.blocks[1].kind,'lead');assert.equal(result.blocks[1].original.text.map(s=>s.text).join(''),'A distinct standfirst.');assert.equal(result.blocks.filter(b=>b.kind==='lead').length,1);assert.equal(result.blocks[2].kind,'paragraph');assert(result.blocks[2].original.text[0].text.startsWith('Scientists'));
});
test('absent standfirst and SEO-only description never invent a lead',()=>{
 const result=parseArticle(html.replace('</head>','<meta name="description" content="An SEO summary, not a standfirst."></head>'),url);
 assert(!result.blocks.some(b=>b.kind==='lead'||b.kind==='introduction'));assert.equal(result.blocks[1].kind,'paragraph');
});
test('metadata confirms visible header lead and related stories are omitted',()=>{
 const markup=html.replace('</head>','<meta name="description" content="Visible introduction."></head>').replace('</h1>','</h1><p>Visible introduction.</p>').replace('</article>','<div data-testid="shortcode_related_article"><p>Related Stories</p></div></article>');
 const result=parseArticle(markup,url);assert.equal(result.blocks[1].kind,'lead');assert(!JSON.stringify(result).includes('Related Stories'));
});
