# Solside oversettelse

Standalone Windows desktop workspace for English-to-Norwegian Bokmål article projects.

Run `npm install`, `npx playwright install chromium`, `npm run build`, then `npm start`.

React lives in src/renderer, isolated IPC in src/preload, and SQLite and Windows-encrypted credentials in src/main. Extraction and image downloading run in utility processes. Project types and service contracts live in src/shared.

Load article extracts a public URL using Readability with a constrained Playwright fallback. Review the continuous article preview before accepting. Leads are distinct from body paragraphs; inline links and formatting stay within their paragraphs. Images load on request through the restricted downloader. Accept creates an unsaved project with aligned empty Norwegian blocks. Cancel preserves your existing article.

Saved projects open from the sidebar. Save updates the current project; Save As creates an independent library copy. No autosave is performed. Unsaved changes are protected when switching, accepting another article or closing.

Schema 3 adds lead blocks. Legacy and schema 2 projects remain readable without rewriting the database on load. Credentials never return through IPC and are never included in project records. Settings are saved separately from articles.

Select **Translate with ChatGPT** to copy a structured prompt into ChatGPT, then paste the JSON reply into Solside oversettelse. This workflow uses your ChatGPT plan and requires no API key. **Translate via API** is an optional direct workflow using GPT-5.4, separately billed OpenAI credits and the API key in Settings. Both fill untranslated blocks, preserve existing Norwegian text, and leave the editable draft unsaved until you click Save. Both prompts use Norwegian news style guidance adapted from Språkvask. To use **DeepL** instead, select it in Settings and save a DeepL API key. The app keeps the OpenAI key separately. **Translate with DeepL** fills untranslated blocks using the DeepL allowance and preserves supported formatting and source links.

Run `npm test` for all regression tests (Chromium required) and `npm run build` for the production build. `node scripts/smoke.cjs` checks Electron launch and isolated IPC; close any other Solside oversettelse instance first. See REVIEW.md for architecture, verification and limitations.

## Phase 2.1 editor

Both article columns support direct structured rich-text editing with TipTap. Headlines, leads and subheadings retain their types. Corresponding blocks align by row height. Basic keyboard formatting, formatted paste and per-block undo/redo are supported. Enter adds a line break; Add aligned paragraph creates a new block pair. Images are shared between columns. Article URLs can be collapsed, and all project saving remains manual.

## Phase 2.2 fact boxes

Editorial fact boxes are extracted as grouped schema 4 blocks, with labels, headings, paragraphs, source attribution and list items. Preview and two-column editing preserve the group and its source position. Existing schema 3 and earlier projects remain compatible; saves remain manual. See REVIEW.md for conservative detection rules and limitations.

## Phase 2.3 text normalization

Raw structured-data headlines and genuine CDATA declarations are normalized during extraction. HTML entities are decoded once according to source context, preserving ordinary Unicode, literal HTML-like text and intentionally encoded examples. Existing saved articles are unchanged.

## Phase 2.4 extraction feedback

A centered workspace spinner keeps your current article visible during extraction. Cancel extraction stops the active request; late results are ignored. Failures remain visible with details and Retry extraction. Article URL and Add aligned paragraph controls use SVG icons. Manual saving remains unchanged.

## Phase 2.5 Save As

Save As opens an in-app naming dialog and creates an independent article in the local library. The new copy becomes active; later Save updates that copy. Cancelling preserves your article, and save errors stay visible. npm test now builds production assets and includes isolated Windows Electron tests for Save As, restart persistence and immediate editor interaction; these tests never use your real article library. The reported desktop focus issue was not reproduced under Electron automation; see REVIEW.md for evidence and limitations.

## Phase 2.6 delete saved articles

Hover or focus a library entry to reveal its trash button. Deletion requires an in-app confirmation naming the article; deleting the open article also warns about any unsaved changes. Cancel keeps everything intact. Confirmed deletion persists locally and never deletes shared images. There is no in-app undo; existing SQLite backups may retain deleted rows. Save and Save As remain manual.

## Phase 2.7 multi-select library

Use checkboxes or Ctrl+Click to toggle selection and Shift+Click for a range. Normal clicks still open articles. With the library focused, Ctrl+A selects all visible articles and Escape clears selection. Delete selected asks for one confirmation; deletion is all-or-none. Selection is separate from the open article and is limited to visible search results. Individual trash actions and manual Save/Save As remain available.

