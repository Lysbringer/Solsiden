// Phase 2 boundaries. Implementations belong in the main process only.
import type { ContentBlock } from './project';
import type { Paragraph } from './types';
export interface ExtractedArticle { title: string; url: string; blocks: ContentBlock[]; method: 'http' | 'browser'; warnings: string[] }
export interface ArticleExtractor { extract(url: string): Promise<ExtractedArticle> }
// Extraction pipeline: Mozilla Readability first; Playwright rendering fallback.
export interface Translator { translate(paragraphs: Paragraph[]): Promise<Paragraph[]> }
export interface ArticleExporter { toHTML(paragraphs: Paragraph[]): Promise<string>; copyRichText(paragraphs: Paragraph[]): Promise<void> }
