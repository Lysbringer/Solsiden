const { test } = require('node:test');
const assert = require('node:assert/strict');
const { translateToBokmal } = require('../dist-electron/main/translate.js');

function completion(translations, finishReason = 'stop') {
 const blocks = Object.fromEntries(translations.map((row, index) => [
  'b' + index, Object.fromEntries(row.map((text, offset) => ['s' + offset, text])),
 ]));
 return Response.json({ choices: [{ finish_reason: finishReason, message: { content: JSON.stringify(blocks) } }] });
}

test('requests Bokmål translation and returns aligned spans', async () => {
 const source = [['A ', 'headline'], ['Next paragraph']];
 const translated = [['En ', 'overskrift'], ['Neste avsnitt']];
 const result = await translateToBokmal(source, 'test-key', async (url, options) => {
  assert.equal(url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(options.headers.Authorization, 'Bearer test-key');
  const body = JSON.parse(options.body);
  assert.equal(body.model, 'gpt-5.4');
  assert.equal(body.store, false);
  assert.deepEqual(JSON.parse(body.messages[1].content), { b0: { s0: 'A ', s1: 'headline' }, b1: { s0: 'Next paragraph' } });
  assert.deepEqual(body.response_format.json_schema.schema.properties.b0.required, ['s0', 's1']);
  return completion(translated);
 });
 assert.deepEqual(result, translated);
});

test('rejects misaligned, truncated and rejected translations', async () => {
 const source = [['A ', 'headline']];
 await assert.rejects(translateToBokmal(source, 'test', async () => completion([['Overskrift']])), /misaligned/);
 await assert.rejects(translateToBokmal(source, 'test', async () => completion([['', '']])), /misaligned/);
 await assert.rejects(translateToBokmal(source, 'test', async () => completion([['En ', 'overskrift']], 'length')), /incomplete/);
 await assert.rejects(translateToBokmal(source, 'test', async () => new Response(null, { status: 401 })), /API key/);
});

test('allows an empty formatting span when the translated block has text', async () => {
 const result = await translateToBokmal([['The ', 'meeting']], 'test', async () => completion([['', 'Møtet']]));
 assert.deepEqual(result, [['', 'Møtet']]);
});
