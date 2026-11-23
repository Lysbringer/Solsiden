const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const {parseArticle}=require('../dist-electron/main/extraction/parser');const {normalizeRawMetadataText,unwrapCDATA}=require('../dist-electron/main/extraction/text-normalization');
const fixture=fs.readFileSync(path.join(__dirname,'fixtures/shenyun-cdata.html'),'utf8');const url='https://www.shenyun.org/news/view/article/e/Sn-bYLGHouI/shen-yun-2027-world-tour.html';const expected='Getting Ready for Shen Yun’s 2027 World Tour';
const plain=b=>b.original.text.map(s=>s.text).join('');
test('actual Shen Yun JSON-LD regression yields the exact Unicode headline',()=>{const article=parseArticle(fixture,url);assert.equal(article.title,expected);assert.equal(plain(article.blocks[0]),expected);assert(!article.title.includes('CDATA'));});
test('raw structured text decodes named and numeric references once without changing whitespace',()=>{assert.equal(normalizeRawMetadataText(' \n<![CDATA[&ldquo;A&rdquo; &amp; &quot;B&quot; &rsquo; &#8217; &#x1F600;]]>\t'),' \n“A” & "B" ’ ’ 😀\t');assert.equal(normalizeRawMetadataText('Åtalet — 中文 ’\n  unchanged'),'Åtalet — 中文 ’\n  unchanged');assert.equal(normalizeRawMetadataText('&amp;rsquo; &amp;#8217;'),'&rsquo; &#8217;');});
test('only complete non-nested CDATA envelopes are unwrapped',()=>{for(const value of ['prefix <![CDATA[text]]> suffix','<![CDATA[unterminated','<![CDATA[outer <![CDATA[inner]]>]]>','<code>text</code>','if (a < b && b > c)'])assert.equal(unwrapCDATA(value),value);});
test('JSON-LD already normalized Unicode and intentional entity spellings survive Readability',()=>{
 for(const [raw,wanted] of [['Already ’ correct','Already ’ correct'],['Example &amp;rsquo; &amp;#8217; &amp;amp;','Example &rsquo; &#8217; &amp;'],['Use <code> and 2 < 3','Use <code> and 2 < 3']]){
 const input=fixture.replace(/"headline": "[^"\n]*"/,`"headline": ${JSON.stringify(raw)}`);assert.equal(parseArticle(input,url).title,wanted);
 }
});
test('DOM headlines, entities, literal markup and double encoding are not decoded again',()=>{
 const body=fs.readFileSync(path.join(__dirname,'fixtures/article.html'),'utf8');
 const input=body.replace('<title>Coastal research</title>','<title>Example &amp;rsquo; &amp;#8217;</title>').replace('<h1>Coastal research</h1>','<h1>Example &amp;rsquo; &amp;#8217;</h1>').replace('</article>','<p>Use &lt;code&gt; &amp; keep &amp;rsquo; and &amp;#8217; literal.</p><p>&lt;![CDATA[literal example]]&gt;</p><!--[CDATA[not article content]]--></article>');
 const article=parseArticle(input,url);assert.equal(article.title,'Example &rsquo; &#8217;');const text=article.blocks.map(plain).join('\n');assert(text.includes('Use <code> & keep &rsquo; and &#8217; literal.'));assert(text.includes('<![CDATA[literal example]]>'));assert(!text.includes('not article content'));
});
test('CDATA and ordinary entities normalize across leads body headings captions and fact-box children',()=>{
 const body=fs.readFileSync(path.join(__dirname,'fixtures/article.html'),'utf8');const input=body.replace('</h1>','</h1><div data-testid="article-excerpt"><![CDATA[Lead &ldquo;quote&rdquo;]]></div>').replace('<h2>Research findings</h2>','<h2><![CDATA[Heading &rsquo;]]></h2><p><![CDATA[Body &amp; detail]]></p>').replace('A coastal research station.','Caption &ldquo;quote&rdquo;').replace('</article>','<section data-component="factbox"><h2><![CDATA[Fact &rsquo;]]></h2><p><![CDATA[Charges &#8217;]]></p><p>Dates &amp; sources</p></section></article>');
 const result=parseArticle(input,url);assert.equal(plain(result.blocks.find(b=>b.kind==='lead')),'Lead “quote”');assert(result.blocks.some(b=>b.kind==='subheading'&&plain(b)==='Heading ’'));assert(result.blocks.some(b=>b.kind==='paragraph'&&plain(b)==='Body & detail'));assert(result.blocks.some(b=>b.kind==='caption'&&plain(b)==='Caption “quote”'));const fact=result.blocks.find(b=>b.kind==='factbox');assert.deepEqual(fact.children.map(plain),['Fact ’','Charges ’','Dates & sources']);
});

test('actual markup CDATA keeps angle brackets as text without creating formatting',()=>{const base=fs.readFileSync(path.join(__dirname,'fixtures/article.html'),'utf8');const result=parseArticle(base.replace('</article>','<p><![CDATA[if (a > b && b < c) use <strong>literal</strong> &amp; punctuation.]]></p></article>'),url);const block=result.blocks.find(b=>plain(b).includes('if (a >'));assert.equal(plain(block),'if (a > b && b < c) use <strong>literal</strong> & punctuation.');assert(block.original.text.every(s=>!s.marks));});
