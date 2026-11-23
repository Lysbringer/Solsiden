import React from 'react';
export function Icon({name}:{name:'plus'|'up'|'down'}) {
 return <svg className="ui-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{name==='plus'?<path d="M12 5v14M5 12h14"/>:<path d={name==='up'?'m6 15 6-6 6 6':'m6 9 6 6 6-6'}/>}</svg>;
}
export function ExtractionLoading({onCancel,cancelling}:{onCancel:()=>void;cancelling:boolean}) {
 return <div className="extraction-loading"><div className="loading-card"><div role="status" aria-live="polite"><svg className="loading-spinner" width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true"><circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="4" opacity=".16"/><path d="M24 4a20 20 0 0 1 20 20" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/></svg><p>{'Extracting article\u2026'}</p></div><small>Your current article stays unchanged.</small><button onClick={onCancel} disabled={cancelling}>{cancelling?'Cancelling...':'Cancel extraction'}</button></div></div>;
}
