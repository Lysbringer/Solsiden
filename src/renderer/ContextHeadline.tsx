import React, { useRef, useState } from 'react';
import type { Inline } from '../shared/project';

export function ContextHeadline({ headline, context, onAccept }: {
 headline: Inline[];
 context: string;
 onAccept: (headline: Inline[]) => void;
}) {
 const input = JSON.stringify([headline, context]);
 const latestInput = useRef(input);
 latestInput.current = input;
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState('');
 const [suggestion, setSuggestion] = useState<{ input: string; headline: Inline[] }>();
 const candidate = suggestion?.input === input ? suggestion.headline : undefined;

 async function suggest() {
  if (busy) return;
  setBusy(true);
  setSuggestion(undefined);
  setError('');
  try {
   const translated = await window.desktop.suggestDeepLHeadline(headline, context);
   if (latestInput.current === input) setSuggestion({ input, headline: translated });
  } catch (error) {
   if (latestInput.current === input) setError(error instanceof Error ? error.message : String(error));
  } finally {
   setBusy(false);
  }
 }

 return <div className="context-headline">
  {!candidate && <button type="button" disabled={busy} onClick={() => void suggest()}>
   {busy ? 'Suggesting headline…' : 'Suggest contextual headline'}
  </button>}
  {error && <p role="alert">{error}</p>}
  {candidate && <section aria-label="Suggested Bokmål headline">
   <strong>Suggested Bokmål headline</strong>
   <p lang="nb">{candidate.map(span => span.text).join('')}</p>
   <div className="context-headline-actions">
    <button type="button" aria-label="Use suggested headline" onClick={() => { onAccept(candidate); setSuggestion(undefined); }}>
     <span aria-hidden="true">✓</span> Use headline
    </button>
    <button type="button" onClick={() => setSuggestion(undefined)}>Decline</button>
   </div>
  </section>}
 </div>;
}
