const { test } = require('node:test');
const assert = require('node:assert/strict');
const { formattedBokmal } = require('../dist-electron/shared/formatted-bokmal.js');

test('copies styled Bokmål headings, inline links, captions and fact lists', () => {
 const block = (id, kind, text, extra = {}) => ({ id, kind, original: { text: [{ text: 'English source' }] }, translation: { text }, ...extra });
 const blocks = [
  block('h', 'headline', [{ text: 'En norsk tittel' }]),
  block('l', 'lead', [{ text: 'Ingress' }]),
  block('p', 'paragraph', [{ text: 'Les <mer>', marks: ['bold'], href: 'https://example.org/?a=1&b=2' }]),
  block('c', 'caption', [{ text: 'Foto: Arkiv' }]),
  block('f', 'factbox', [], { children: [
   block('t', 'subheading', [{ text: 'Fakta' }], { factRole: 'title' }),
   block('i', 'paragraph', [{ text: 'Første punkt' }], { factRole: 'list-item', listStyle: 'ordered', ordinal: 3 }),
  ] }),
  block('u', 'paragraph', []),
 ];
 const { html, text } = formattedBokmal({ id: 'p', title: 'English title', url: '', updatedAt: '', schemaVersion: 4, blocks, paragraphs: [] });
 assert(html.includes('<h1>En norsk tittel</h1><p><strong>Ingress</strong></p>'));
 assert(html.includes('<a href="https://example.org/?a=1&amp;b=2"><strong>Les &lt;mer&gt;</strong></a>'));
 assert(html.includes('<figcaption>Foto: Arkiv</figcaption>'));
 assert(html.includes('<aside><h2>Fakta</h2><ol start="3"><li>Første punkt</li></ol></aside>'));
 assert(text.includes('Fakta\n3. Første punkt'));
 assert(!html.includes('English'));
});
