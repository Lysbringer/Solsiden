const { test } = require('node:test');
const assert = require('node:assert/strict');
const { suggestDeepLHeadline, translateWithDeepL } = require('../dist-electron/main/deepl.js');

test('DeepL translates blocks as HTML and reconstructs trusted formatting and links', async () => {
 const href = 'https://example.org/article?a=1&b=2';
 const input = [[{ text: 'Read <this> & ', marks: ['bold'] }, { text: 'the article', href }]];
 const translated = await translateWithDeepL(input, 'test:fx', async (url, options) => {
  assert.equal(url, 'https://api-free.deepl.com/v2/translate');
  assert.equal(options.headers.Authorization, 'DeepL-Auth-Key test:fx');
  assert.deepEqual(JSON.parse(options.body), {
   text: ['<p><strong>Read &lt;this&gt; &amp; </strong><a href="https://bokmal.invalid/0">the article</a></p>'],
   source_lang: 'EN', target_lang: 'NB', tag_handling: 'html',
  });
  return Response.json({ translations: [{ text: '<p><a href="https://bokmal.invalid/0">Artikkelen</a> <strong>er klar</strong><br>Les mer.</p>' }] });
 });
 assert.deepEqual(translated, [[{ text: 'Artikkelen', href }, {text: ' '}, { text: 'er klar', marks: ['bold'] }, {text: '\n'}, {text: 'Les mer.'}]]);
});

test('DeepL batches articles and reports lost links and exhausted allowances', async () => {
 const sizes = [];
 const sample = Array.from({ length: 26 }, () => [{ text: 'Article text' }]);
 const rows = await translateWithDeepL(sample, 'test', async (url, options) => {
  assert.equal(url, 'https://api.deepl.com/v2/translate');
  const { text } = JSON.parse(options.body);
  sizes.push(text.length);
  return Response.json({ translations: text.map(() => ({ text: '<p>Artikkeltekst</p>' })) });
 });
 assert.equal(rows.length, 26);
 assert.deepEqual(sizes, [25, 1]);
 await assert.rejects(translateWithDeepL(sample, 'test', async () => new Response(null, { status: 456 })), /allowance is exhausted/);
 await assert.rejects(translateWithDeepL([[{ text: 'Link', href: 'https://example.org' }]], 'test',
  async () => Response.json({ translations: [{ text: '<p><a href="https://untrusted.example/">Lenke</a></p>' }] })
 ), /lost an article link/);
});

test('DeepL sends the headline as the only translation target and the article separately as context', async () => {
 const context = 'The match ended in a draw.';
 const result = await suggestDeepLHeadline({ headline: [{ text: 'No winner' }], context }, 'test', async (_url, options) => {
  assert.deepEqual(JSON.parse(options.body), {
   text: ['<p>No winner</p>'], source_lang: 'EN', target_lang: 'NB', tag_handling: 'html', context,
  });
  return Response.json({ translations: [{ text: '<p>Ingen vinner</p>' }] });
 });
 assert.deepEqual(result, [{ text: 'Ingen vinner' }]);
});
