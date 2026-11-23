import { JSDOM } from 'jsdom';
import type { Inline } from '../shared/project';

const tags = { bold: 'strong', italic: 'em', underline: 'u', code: 'code' } as const;
const marks = { STRONG: 'bold', B: 'bold', EM: 'italic', I: 'italic', U: 'underline', CODE: 'code' } as const;
const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function translateWithDeepL(input: unknown, key: string, request = fetch, context?: string): Promise<Inline[][]> {
 if (!Array.isArray(input) || !input.length || !input.every(row => Array.isArray(row) && row.length &&
  row.every(span => span && typeof span.text === 'string' &&
   (span.href === undefined || typeof span.href === 'string') &&
   (span.marks === undefined || (Array.isArray(span.marks) && span.marks.every((mark: string) => Object.hasOwn(tags, mark)))))
 )) throw new Error('Invalid DeepL translation request.');
 if (JSON.stringify(input).length > 100000) throw new Error('This article is too long for DeepL translation.');
 const rows = input as Inline[][];
 const sources = rows.map(row => {
  const links = new Map<string, string>();
  const html = row.map(span => {
   let content = escapeHtml(span.text).replace(/\n/g, '<br>');
   for (const mark of span.marks ?? []) content = '<' + tags[mark] + '>' + content + '</' + tags[mark] + '>';
   if (span.href && /^https?:\/\//i.test(span.href)) {
    const token = 'https://bokmal.invalid/' + links.size;
    links.set(token, span.href);
    content = '<a href="' + token + '">' + content + '</a>';
   }
   return content;
  }).join('');
  return { html: '<p>' + html + '</p>', links };
 });
 const endpoint = key.endsWith(':fx') ? 'https://api-free.deepl.com/v2/translate' : 'https://api.deepl.com/v2/translate';
 const translations: Inline[][] = [];
 const dom = new JSDOM();
 try {
  for (let start = 0; start < sources.length; start += 25) {
   const batch = sources.slice(start, start + 25);
   const body = JSON.stringify({ text: batch.map(source => source.html), source_lang: 'EN', target_lang: 'NB', tag_handling: 'html', ...(context ? { context } : {}) });
   if (Buffer.byteLength(body) > 128 * 1024) throw new Error('This article exceeds DeepL’s request size limit.');
   const response = await request(endpoint, {
    method: 'POST', headers: { Authorization: 'DeepL-Auth-Key ' + key, 'Content-Type': 'application/json' },
    body, signal: AbortSignal.timeout(60000), redirect: 'error',
   });
   if ([401, 403].includes(response.status)) throw new Error('DeepL rejected the API key. Check it in Settings.');
   if (response.status === 456) throw new Error('The DeepL translation allowance is exhausted.');
   if (response.status === 429) throw new Error('DeepL rate limit reached. Try again shortly.');
   if (!response.ok) throw new Error('DeepL translation failed (HTTP ' + response.status + ').');
   const result = (await response.json()).translations;
   if (!Array.isArray(result) || result.length !== batch.length) throw new Error('DeepL returned an incomplete translation.');
   result.forEach((item, index) => {
    if (typeof item?.text !== 'string') throw new Error('DeepL returned an invalid translation.');
    const template = dom.window.document.createElement('template');
    template.innerHTML = item.text;
    const links = batch[index].links;
    const seen = new Set<string>();
    function read(node: Node, active: NonNullable<Inline['marks']> = [], href?: string): Inline[] {
     if (node.nodeType === 3) return [{ text: node.textContent ?? '', ...(active.length ? { marks: active } : {}), ...(href ? { href } : {}) }];
     if (node.nodeType !== 1 && node.nodeType !== 11) return [];
     const el = node as Element;
     if (['SCRIPT', 'STYLE', 'IFRAME'].includes(el.tagName)) return [];
     if (el.tagName === 'BR') return [{ text: '\n' }];
     if (el.tagName === 'A') {
      const token = el.getAttribute('href') ?? '';
      href = links.get(token);
      if (href && el.textContent?.trim()) seen.add(token);
     }
     const mark = marks[el.tagName as keyof typeof marks];
     return Array.from(node.childNodes).flatMap(child => read(child, mark && !active.includes(mark) ? [...active, mark] : active, href));
    }
    const spans = read(template.content);
    if (!spans.some(span => span.text.trim()) || seen.size !== links.size) {
     throw new Error('DeepL returned a blank block or lost an article link. No translation was applied.');
    }
    translations.push(spans);
   });
  }
  return translations;
 } finally { dom.window.close(); }
}

export async function suggestDeepLHeadline(input: unknown, key: string, request = fetch): Promise<Inline[]> {
 const { headline, context } = (input ?? {}) as { headline?: unknown; context?: unknown };
 if (typeof context !== 'string' || !context.trim() || context.length > 6000 ||
  !Array.isArray(headline) || !headline.some(span => typeof span?.text === 'string' && span.text.trim())) {
  throw new Error('Add an English headline and article text to suggest a contextual headline.');
 }
 const [suggestion] = await translateWithDeepL([headline], key, request, context);
 return suggestion;
}
