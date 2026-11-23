import type { ContentBlock, Inline } from './project';
import { editorProject } from './rich-text';
import type { Project } from './types';

const tags = { bold: 'strong', italic: 'em', underline: 'u', code: 'code' } as const;
const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const escape = (value: string) => value.replace(/[&<>"]/g, char => entities[char]);

function renderSpans(spans: Inline[]) {
 return spans.map(span => {
  let html = escape(span.text).replace(/\r?\n/g, '<br>');
  for (const mark of span.marks ?? []) {
   const tag = tags[mark];
   html = '<' + tag + '>' + html + '</' + tag + '>';
  }
  if (span.href && /^https?:\/\//i.test(span.href)) html = '<a href="' + escape(span.href) + '">' + html + '</a>';
  return html;
 }).join('');
}

function renderBlocks(blocks: ContentBlock[]): { html: string; text: string }[] {
 const parts: { html: string; text: string }[] = [];
 let list: { style: 'ordered' | 'unordered'; items: string[]; start: number } | undefined;
 function finishList() {
  if (!list) return;
  const tag = list.style === 'ordered' ? 'ol' : 'ul';
  const start = tag === 'ol' && list.start !== 1 ? ' start="' + list.start + '"' : '';
  parts.push({ html: '<' + tag + start + '>' + list.items.join('') + '</' + tag + '>', text: '' });
  list = undefined;
 }
 for (const block of blocks) {
  const spans = block.translation.text;
  const text = spans.map(span => span.text).join('');
  if (block.factRole === 'list-item' && text.trim()) {
   const style = block.listStyle ?? 'unordered';
   if (list?.style !== style) finishList();
   list ??= { style, items: [], start: Number.isSafeInteger(block.ordinal) ? block.ordinal! : 1 };
   const number = list.start + list.items.length;
   list.items.push('<li>' + renderSpans(spans) + '</li>');
   parts.push({ html: '', text: (style === 'ordered' ? number + '. ' : '• ') + text });
   continue;
  }
  finishList();
  if (block.kind === 'factbox') {
   const children = renderBlocks(block.children ?? []);
   if (children.length) parts.push({
    html: '<aside>' + children.map(child => child.html).join('') + '</aside>',
    text: children.map(child => child.text).filter(Boolean).join('\n'),
   });
  } else if (block.kind !== 'image' && text.trim()) {
   const contents = renderSpans(spans);
   const tag = block.kind === 'headline' ? 'h1' : block.kind === 'subheading' || block.factRole === 'title' ? 'h2' : 'p';
   const html = block.kind === 'caption' ? '<figure><figcaption>' + contents + '</figcaption></figure>' :
    '<' + tag + '>' + (block.kind === 'lead' || block.factRole === 'label' ? '<strong>' + contents + '</strong>' : contents) + '</' + tag + '>';
   parts.push({ html, text });
  }
 }
 finishList();
 return parts;
}

export function formattedBokmal(project: Project): { html: string; text: string } {
 const parts = renderBlocks(editorProject(project).blocks!);
 if (!parts.length) throw new Error('Add Norwegian text before copying the article.');
 return {
  html: '<article lang="nb">' + parts.map(part => part.html).join('') + '</article>',
  text: parts.map(part => part.text).filter(Boolean).join('\n\n'),
 };
}
