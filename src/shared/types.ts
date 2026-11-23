import type { ContentBlock, Inline } from './project';
export interface Paragraph { id: string; original: string; translation: string }
export interface Project { schemaVersion?: 2 | 3 | 4; blocks?: ContentBlock[]; id: string; title: string; url: string; paragraphs: Paragraph[]; updatedAt: string }
export interface Settings { provider: string; hasKey: boolean; configuredProviders?: string[] }
export interface DeepLPanelBounds { x: number; y: number; width: number; height: number }
export interface DesktopAPI {
 readonly isDeveloperEdition: boolean;
 suggestDeepLHeadline(headline: Inline[], context: string): Promise<Inline[]>;
 openDeepLPanel(id: string, source: string, bounds: DeepLPanelBounds): Promise<void>;
 positionDeepLPanel(id: string, bounds: DeepLPanelBounds): void;
 closeDeepLPanel(id: string): Promise<void>;
 readDeepLTranslation(id: string): Promise<string>;
 copyFormattedBokmal(project: Project): Promise<void>;
 translate(rows: string[][]): Promise<string[][]>;
 translateDeepL(rows: import('./project').Inline[][]): Promise<import('./project').Inline[][]>;
 previewImage(url: string): Promise<string>;
 cancelExtraction(requestId: string): Promise<void>;
 extract(url: string, requestId?: string): Promise<import('./future-services').ExtractedArticle>;
 onCloseCheck(check: () => boolean): () => void;
 deleteArticles(ids:string[]): Promise<void>;
 deleteArticle(id:string): Promise<void>;
 list(): Promise<Project[]>;
 save(project: Project): Promise<Project>;
 settings(): Promise<Settings>;
 configure(provider: string, key: string): Promise<void>;
 setDirty(dirty: boolean): void;
}
declare global { interface Window { desktop: DesktopAPI } }
