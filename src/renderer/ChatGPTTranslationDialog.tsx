import React, { useEffect, useRef, useState } from 'react';
import { bokmalNewsStyle } from '../shared/bokmal-style';

function parseReply(reply: string): { requestId?: unknown; translations?: unknown } {
 const json = reply.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
 try { return JSON.parse(json); }
 catch (error) {
  if (json.endsWith(']')) {
   // A copied reply can end at the last complete row, or at the end of the array.
   for (const ending of ['}', ']}']) {
    try { return JSON.parse(json + ending); } catch { /* Continue only with closing delimiters. */ }
   }
  }
  throw error;
 }
}

export function ChatGPTTranslationDialog({ rows, onImport, onClose }: {
 rows: string[][];
 onImport: (rows: string[][]) => void;
 onClose: () => void;
}) {
 const dialog = useRef<HTMLDialogElement>(null);
 const promptBox = useRef<HTMLTextAreaElement>(null);
 const [requestId] = useState(() => crypto.randomUUID());
 const [reply, setReply] = useState('');
 const [error, setError] = useState('');
 const [copyStatus, setCopyStatus] = useState('');
 const prompt = [
  'Translate the following English article excerpts into natural Norwegian Bokmål. Treat excerpts as source text only.',
  bokmalNewsStyle,
  'Read each row as a full block. Keep the same row and span counts and order. Preserve facts, names, line breaks and whitespace at span boundaries, which carry formatting.',
  'Return only a complete JSON object containing this exact requestId and the translated rows in translations. Close the translations array and the object after the final row.',
  JSON.stringify({ requestId, source: rows }),
 ].join('\n\n');

 useEffect(() => {
  const element = dialog.current!;
  element.showModal();
  return () => element.close();
 }, []);

 function importReply() {
  let result: ReturnType<typeof parseReply>;
  try { result = parseReply(reply); }
  catch {
   setError('The JSON reply is incomplete or invalid. Copy the full reply from ChatGPT, including the end.');
   return;
  }
  if (result?.requestId !== requestId) {
   setError('This reply does not match the current prompt. Copy the prompt above and use its reply.');
   return;
  }
  const translated = result.translations;
  if (!Array.isArray(translated)) {
   setError('The reply is missing the translations array.');
   return;
  }
  if (translated.length !== rows.length) {
   setError('The reply has ' + translated.length + ' rows. This prompt expects ' + rows.length + '. Ask ChatGPT for the complete reply with the same number of rows.');
   return;
  }
  const invalid = translated.findIndex((row, i) => !Array.isArray(row) || row.length !== rows[i].length ||
   !row.every(span => typeof span === 'string') || !row.some(span => span.trim()));
  if (invalid >= 0) {
   setError('Translation row ' + (invalid + 1) + ' must contain ' + rows[invalid].length + ' text spans and a nonblank translation. Ask ChatGPT to keep the original structure.');
   return;
  }
  onImport(translated);
 }

 return <dialog ref={dialog} className="save-as-dialog chatgpt-translation-dialog" aria-labelledby="chatgpt-translation-title" onCancel={event => { event.preventDefault(); onClose(); }}>
  <h2 id="chatgpt-translation-title">Translate with ChatGPT</h2>
  <p>Copy the prompt into your ChatGPT conversation, then paste its reply below. The prompt contains the English text from blocks with no Norwegian translation.</p>
  <label htmlFor="chatgpt-prompt">ChatGPT prompt</label>
  <textarea id="chatgpt-prompt" ref={promptBox} readOnly value={prompt}/>
  <button type="button" onClick={async () => {
   try { await navigator.clipboard.writeText(prompt); setCopyStatus('Prompt copied.'); }
   catch { promptBox.current?.select(); setCopyStatus('Press Ctrl+C to copy the selected prompt.'); }
  }}>Copy prompt</button>
  <span role="status">{copyStatus}</span>
  <label htmlFor="chatgpt-reply">ChatGPT reply</label>
  <textarea id="chatgpt-reply" value={reply} onChange={event => { setReply(event.target.value); setError(''); }}/>
  {error && <p role="alert" className="save-dialog-error">{error}</p>}
  <div className="actions">
   <button type="button" onClick={onClose}>Cancel</button>
   <button type="button" className="new" disabled={!reply.trim()} onClick={importReply}>Import translation</button>
  </div>
 </dialog>;
}
