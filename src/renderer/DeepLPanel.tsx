import React, { useEffect, useRef, useState } from 'react';

export function DeepLPanel({ source, onClose, onAccept, formatted }: {
 source: string; onClose: () => void; onAccept: (text: string) => void; formatted: boolean;
}) {
 const [status, setStatus] = useState('Loading DeepL…');
 const [reading, setReading] = useState(false);
 const [preview, setPreview] = useState<string>();
 const surface = useRef<HTMLDivElement>(null);
 const previewDialog = useRef<HTMLDialogElement>(null);
 const [id] = useState(() => crypto.randomUUID());

 useEffect(() => {
  const element = surface.current!;
  const workspace = element.closest('.article-editor')!;
  let active = true;
  let frame = 0;
  function bounds() {
   const area = element.getBoundingClientRect();
   const viewport = workspace.getBoundingClientRect();
   const x = Math.max(area.left, viewport.left);
   const y = Math.max(area.top, viewport.top);
   const covered = document.querySelector('dialog[open], .overlay, .extraction-loading');
   return {
    x, y,
    width: Math.max(0, Math.min(area.right, viewport.right) - x),
    height: covered ? 0 : Math.max(0, Math.min(area.bottom, viewport.bottom) - y),
   };
  }
  const initial = bounds();
  let last = JSON.stringify(initial);
  setStatus('Loading DeepL…');
  window.desktop.openDeepLPanel(id, source, initial).then(() => {
   if (active) setStatus('');
  }).catch(() => {
   if (active) setStatus('Could not load DeepL. Check your connection, then close and reopen the popup.');
  });
  function schedulePosition() {
   if (frame) return;
   frame = requestAnimationFrame(() => {
    frame = 0;
    const next = bounds();
    const serialized = JSON.stringify(next);
    if (last !== serialized) {
     last = serialized;
     window.desktop.positionDeepLPanel(id, next);
    }
   });
  }
  const resize = new ResizeObserver(schedulePosition);
  resize.observe(element);
  resize.observe(workspace);
  if (workspace.firstElementChild) resize.observe(workspace.firstElementChild);
  const overlays = new MutationObserver(schedulePosition);
  overlays.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
  window.addEventListener('scroll', schedulePosition, true);
  window.addEventListener('resize', schedulePosition);
  return () => {
   active = false;
   cancelAnimationFrame(frame);
   resize.disconnect();
   overlays.disconnect();
   window.removeEventListener('scroll', schedulePosition, true);
   window.removeEventListener('resize', schedulePosition);
   void window.desktop.closeDeepLPanel(id).catch(() => {});
  };
 }, [id, source]);

 useEffect(() => {
  const dialog = previewDialog.current;
  if (!dialog) return;
  dialog.showModal();
  return () => dialog.close();
 }, [preview]);

 async function readTranslation() {
  setReading(true);
  setStatus('');
  try { setPreview(await window.desktop.readDeepLTranslation(id)); }
  catch (error) { setStatus(error instanceof Error ? error.message : String(error)); }
  finally { setReading(false); }
 }

 async function close(translation?: string) {
  const field = surface.current?.closest('.article-editor')?.querySelector<HTMLElement>('.deepl-active-row [aria-label^="translation "][contenteditable="true"]');
  try {
   await window.desktop.closeDeepLPanel(id);
   if (!surface.current?.isConnected) return;
   if (translation) onAccept(translation);
   onClose();
   requestAnimationFrame(() => field?.focus());
  } catch {
   setStatus('Could not close DeepL. Try again.');
  }
 }

 return <section className="deepl-row-panel" aria-label="DeepL Translator" aria-busy={status === 'Loading DeepL…'}
  onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } }}>
  <div className="deepl-row-toolbar">
   {status && <p role="status">{status}</p>}
   <div className="deepl-row-actions">
    <button type="button" className="deepl-action-bar" disabled={reading || status === 'Loading DeepL…'} onClick={readTranslation}>
     {reading ? 'Reading translation…' : 'Use this translation'}
    </button>
    <button type="button" className="deepl-action-bar" onClick={() => void close()}>Close DeepL</button>
   </div>
  </div>
  <div className="deepl-row-surface" ref={surface}/>
  {preview && <dialog ref={previewDialog} className="save-as-dialog deepl-translation-preview" aria-label="Preview DeepL translation"
   onKeyDown={event => { if (event.key === 'Escape') event.stopPropagation(); }}
   onCancel={event => { event.preventDefault(); setPreview(undefined); }}>
   <h2>Preview DeepL translation</h2>
   <p lang="nb" className="deepl-preview-text">{preview}</p>
   {formatted && <p>Applying this text replaces the current field’s formatting and links.</p>}
   <div className="actions">
    <button autoFocus type="button" onClick={() => setPreview(undefined)}>Cancel</button>
    <button type="button" className="new" onClick={() => void close(preview)}>Replace Norwegian text</button>
   </div>
  </dialog>}
 </section>;
}
