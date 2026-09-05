import { useEffect, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { disablePush, enablePush, hasPush, needsHomeScreen, pushSupported } from './pushNotifications';
import { IS_LOCAL_DEMO } from './api';

export function PushNotificationControl({ accountId }: { accountId: string }) {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const install = needsHomeScreen();
  const supported = pushSupported();
  useEffect(() => {
    let active = true;
    void hasPush(accountId).then((value) => { if (active) setEnabled(value) }).catch(() => {});
    return () => { active = false };
  }, [accountId]);
  const toggle = async () => {
    setBusy(true); setMessage('');
    try {
      if (enabled) await disablePush(); else await enablePush(accountId);
      setEnabled(!enabled);
      setMessage(enabled ? 'Avisos desactivados en este móvil.' : 'Recibirás avisos de los partidos que te asigne coordinación.');
    } catch (error) { setEnabled(await hasPush(accountId).catch(() => false)); setMessage(error instanceof Error ? error.message : 'No se pudieron configurar los avisos.'); }
    finally { setBusy(false) }
  };
  return <section className="push-notification-control" aria-label="Notificaciones del móvil">
    <div><strong><Bell size={17} aria-hidden="true" /> Avisos en tu móvil</strong><p>{IS_LOCAL_DEMO ? 'Disponibles en la versión publicada de Convo.' : install ? 'En iPhone: Compartir → Añadir a pantalla de inicio. Abre Convo desde su icono para activar los avisos.' : !supported ? 'Abre Convo en un navegador compatible o desde su icono en el móvil.' : enabled ? 'Activados para tu cuenta en este dispositivo.' : 'Entérate cuando coordinación te asigne un partido, aunque Convo esté cerrada.'}</p></div>
    {!IS_LOCAL_DEMO && !install && supported && <button type="button" className="primary-button" onClick={() => void toggle()} disabled={busy}>{enabled ? <BellOff size={16} /> : <Bell size={16} />}{busy ? 'Configurando…' : enabled ? 'Desactivar avisos' : 'Activar avisos'}</button>}
    {message && <p className="push-notification-message" role="status">{message}</p>}
  </section>;
}
