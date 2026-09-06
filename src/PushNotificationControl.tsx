import { useEffect, useId, useRef, useState } from 'react';
import { Bell, BellOff, X } from 'lucide-react';
import { disablePush, enablePush, hasPush, needsHomeScreen, pushSupported } from './pushNotifications';
import { IS_LOCAL_DEMO } from './api';

export function PushNotificationControl({ accountId }: { accountId: string }) {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const install = needsHomeScreen();
  const supported = pushSupported();
  useEffect(() => {
    let active = true;
    void hasPush(accountId).then((value) => { if (active) setEnabled(value) }).catch(() => {});
    return () => { active = false };
  }, [accountId]);
  useEffect(() => {
    const refresh = () => { void hasPush(accountId).then(setEnabled).catch(() => {}) };
    window.addEventListener('convo-push-changed', refresh);
    return () => window.removeEventListener('convo-push-changed', refresh);
  }, [accountId]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setOpen(false) };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); triggerRef.current?.focus() } };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) };
  }, [open]);
  const toggle = async () => {
    setBusy(true); setMessage('');
    try {
      if (enabled) await disablePush(); else await enablePush(accountId);
      setEnabled(!enabled);
      setMessage(enabled ? 'Avisos desactivados en este móvil.' : 'Recibirás avisos de los partidos que te asigne coordinación.');
    } catch (error) { setEnabled(await hasPush(accountId).catch(() => false)); setMessage(error instanceof Error ? error.message : 'No se pudieron configurar los avisos.'); }
    finally { setBusy(false); window.dispatchEvent(new Event('convo-push-changed')) }
  };
  return <div className="notification-menu" ref={menuRef}>
    <button ref={triggerRef} type="button" className="notification-bell" aria-label={enabled ? 'Notificaciones: avisos activados' : 'Configurar notificaciones'} title={enabled ? 'Avisos activados en este dispositivo' : 'Notificaciones'} aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(!open)}>
      <Bell size={19} aria-hidden="true" />{enabled && <span className="notification-enabled-dot" aria-hidden="true" />}
    </button>
    {open && <section id={panelId} className="push-notification-control" aria-label="Notificaciones del móvil">
    <header><strong>Notificaciones</strong><button type="button" className="notification-close" aria-label="Cerrar notificaciones" onClick={() => { setOpen(false); triggerRef.current?.focus() }}><X size={17} /></button></header>
    <p>{IS_LOCAL_DEMO ? 'Disponibles en la versión publicada de Convo.' : install ? 'En iPhone: Compartir → Añadir a pantalla de inicio. Abre Convo desde su icono para activar los avisos.' : !supported ? 'Abre Convo en un navegador compatible o desde su icono en el móvil.' : enabled ? 'Avisos activados en este dispositivo.' : 'Recibe avisos de nuevos partidos, aunque Convo esté cerrada.'}</p>
    {!IS_LOCAL_DEMO && !install && supported && <button type="button" className="primary-button" onClick={() => void toggle()} disabled={busy}>{enabled ? <BellOff size={16} /> : <Bell size={16} />}{busy ? 'Configurando…' : enabled ? 'Desactivar avisos' : 'Activar avisos'}</button>}
    <small>Solo recibirás los avisos de tu equipo.</small>
    {message && <p className="push-notification-message" role="status">{message}</p>}
  </section>}
  </div>;
}
