import React, { useEffect, useRef } from 'react';

export function ConfirmArticleDialog({ title, detail, action, onConfirm, onCancel }: {
 title: string;
 detail: string;
 action: string;
 onConfirm: () => void;
 onCancel: () => void;
}) {
 const dialog = useRef<HTMLDialogElement>(null);
 useEffect(() => {
  const element = dialog.current!;
  element.showModal();
  return () => element.close();
 }, []);
 return <dialog ref={dialog} className="save-as-dialog" aria-labelledby="confirm-article-title"
  onCancel={event => { event.preventDefault(); onCancel(); }}>
  <h2 id="confirm-article-title">{title}</h2>
  <p>{detail}</p>
  <div className="actions">
   <button type="button" autoFocus onClick={onCancel}>Cancel</button>
   <button type="button" className="new" onClick={onConfirm}>{action}</button>
  </div>
 </dialog>;
}
