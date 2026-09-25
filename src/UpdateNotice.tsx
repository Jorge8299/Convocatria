import { useEffect, useRef, useState } from 'react';
import { Sparkles, UserSearch, X } from 'lucide-react';

const CURRENT_UPDATE = {
  id: '2026-09-captacion',
  title: 'Nueva sección de Captación',
  description: 'Los entrenadores ya pueden anotar jugadores interesantes y coordinación puede consultarlos por entrenador.',
};

const storageKey = (accountId: string) => `convo_update_seen_${accountId}_${CURRENT_UPDATE.id}`;

export function UpdateNotice({ accountId }: { accountId: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [visible, setVisible] = useState(() => localStorage.getItem(storageKey(accountId)) !== '1');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (visible && dialog && !dialog.open) dialog.showModal();
  }, [visible]);

  const dismiss = () => {
    localStorage.setItem(storageKey(accountId), '1');
    dialogRef.current?.close();
    setVisible(false);
  };

  if (!visible) return null;
  return <dialog ref={dialogRef} className="update-notice" aria-labelledby="update-notice-title" onCancel={event => { event.preventDefault(); dismiss(); }}>
    <button type="button" className="update-notice-close" aria-label="Cerrar novedades" onClick={dismiss}><X size={18} /></button>
    <span className="update-notice-icon"><Sparkles size={22} /></span>
    <span className="eyebrow">NOVEDAD EN CONVO</span>
    <h2 id="update-notice-title">{CURRENT_UPDATE.title}</h2>
    <div className="update-notice-feature"><UserSearch size={20} /><p>{CURRENT_UPDATE.description}</p></div>
    <button type="button" className="primary-button" onClick={dismiss}>Entendido</button>
  </dialog>;
}
