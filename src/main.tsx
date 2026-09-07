import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import ClubShell from './ClubShell.tsx';
import './index.css';
import PublicEnrollment from './PublicEnrollment';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {location.pathname.startsWith('/inscripcion/') || location.pathname === '/pago' ? <PublicEnrollment/> : <ClubShell />}
  </StrictMode>,
);

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  addEventListener('load', () => void navigator.serviceWorker.register('/sw.js'));
}
