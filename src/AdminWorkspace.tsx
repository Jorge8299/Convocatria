import { useState } from 'react';
import { ArrowUpRight, ChevronRight, Home, Users, KeyRound, FileUp, Wallet, Menu, X, LogOut, ShieldCheck, Plus } from 'lucide-react';
import { useClub } from './ClubContext';
import type { ClubAccount } from './clubTypes';
import './admin-workspace.css';

export type AdminSection = 'home' | 'teams' | 'access' | 'rivals' | 'economy';
const sections = [
  { id: 'home', label: 'Inicio', description: 'Una visión general de tu club y sus equipos.', icon: Home },
  { id: 'teams', label: 'Equipos y plantillas', description: 'Consulta los jugadores, rivales y campos de cada equipo.', icon: Users },
  { id: 'access', label: 'Cuentas y accesos', description: 'Organiza el equipo técnico y administra sus accesos.', icon: KeyRound },
  { id: 'rivals', label: 'Rivales y campos', description: 'Prepara los rivales de cada equipo para la temporada.', icon: FileUp },
  { id: 'economy', label: 'Gestión económica', description: 'Gestiona las cuotas y los plazos del club.', icon: Wallet },
] as const;

export function AdminNavigation({ section, onSection, canPreviewEconomy, account, onLogout }: {
  section: AdminSection; onSection: (section: AdminSection) => void; canPreviewEconomy: boolean;
  account: ClubAccount; onLogout: () => void;
}) {
  const club = useClub();
  const [menuOpen, setMenuOpen] = useState(false);
  const current = sections.find(item => item.id === section)!;
  return <>
    <aside className="admin-sidebar">
      <div className="admin-brand"><span className="admin-brand-mark">C<span>.</span></span><div><strong>convo</strong><small>ADMINISTRACIÓN DEL CLUB</small></div>
        <button className="admin-menu-toggle" aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'} aria-expanded={menuOpen} aria-controls="admin-navigation" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={22}/> : <Menu size={22}/>}</button>
      </div>
      <div className="admin-club-identity">{club?.logo ? <img src={club.logo} alt=""/> : <ShieldCheck size={28}/>}<div><strong>{club?.nombre || 'Mi club'}</strong><small>Espacio de administración</small></div></div>
      <nav id="admin-navigation" className={menuOpen ? 'is-open' : ''} aria-label="Administración del club">
        <span className="admin-nav-caption">GESTIÓN DEL CLUB</span>
        {sections.filter(item => item.id !== 'economy' || canPreviewEconomy).map(({id, label, icon: Icon}) => <button key={id} aria-current={section === id ? 'page' : undefined} onClick={() => { onSection(id); setMenuOpen(false); }}><Icon size={19}/><span>{label}</span>{section === id && <ChevronRight size={15}/>}</button>)}
      </nav>
      <div className="admin-sidebar-footer"><ShieldCheck size={19}/><div><strong>Administración</strong><small>Todo tu club, en un mismo lugar.</small></div></div>
    </aside>
    <header className="admin-workspace-header"><div><span>Administración <ChevronRight size={12}/> {current.label}</span><h1>{current.label}</h1><p>{current.description}</p></div><div className="admin-session"><span className="admin-user-initial">{account.name.slice(0,1).toUpperCase()}</span><div><strong>{account.name}</strong><small>Administrador</small></div><button onClick={onLogout} aria-label="Cerrar sesión" title="Cerrar sesión"><LogOut size={19}/></button></div></header>
  </>;
}

export function AdminOverview({ accounts, playerCount, onSection, onTeam }: {
  accounts: ClubAccount[]; playerCount: number; onSection: (section: AdminSection) => void; onTeam: (id: string) => void;
}) {
  const club = useClub();
  const coaches = accounts.filter(item => item.role === 'entrenador' && item.active);
  const coordinators = accounts.filter(item => item.role === 'coordinador' && item.active);
  const inactive = accounts.filter(item => item.role !== 'superadmin' && !item.active).length;
  return <div className="admin-overview">
    <section className="admin-welcome"><div><span className="admin-kicker">EL CLUB, BIEN ORGANIZADO</span><h2>Todo preparado para<br/>hacer equipo.</h2><p>Gestiona {club?.nombre || 'tu club'} desde aquí. Personas, equipos y temporada, con cada cosa en su sitio.</p><button onClick={() => onSection('access')}><Plus size={18}/> Añadir equipo o acceso <ArrowUpRight size={17}/></button></div><div className="admin-welcome-crest" aria-hidden="true">{club?.logo ? <img src={club.logo} alt=""/> : <ShieldCheck size={80}/>}</div></section>
    <section className="admin-summary" aria-label="Resumen del club">{[
      {label:'Equipos activos', value:coaches.length, note:'Con acceso de entrenador', icon:Users},
      {label:'Jugadores', value:playerCount, note:'En las plantillas activas', icon:ShieldCheck},
      {label:'Coordinadores', value:coordinators.length, note:'Con acceso activo', icon:KeyRound},
    ].map(({label,value,note,icon:Icon}) => <article key={label}><div><span>{label}</span><Icon size={19}/></div><strong>{value}</strong><small>{note}</small></article>)}</section>
    <div className="admin-home-columns"><section className="admin-home-card"><header><div><span className="admin-kicker">ÁREA DEPORTIVA</span><h2>Equipos del club</h2></div><button onClick={() => onSection('teams')}>Ver todos <ArrowUpRight size={16}/></button></header><div className="admin-team-directory">{coaches.slice(0,5).map(coach => <button key={coach.id} onClick={() => onTeam(coach.id)}><span className="admin-team-icon"><Users size={20}/></span><span><strong>{coach.teamLabel || 'Equipo'}</strong><small>{coach.name}</small></span><ChevronRight size={17}/></button>)}{coaches.length === 0 && <div className="admin-empty"><Users size={28}/><strong>El primer equipo empieza aquí</strong><p>Crea el acceso de su entrenador para empezar a organizar el club.</p><button onClick={() => onSection('access')}>Crear primer equipo <Plus size={16}/></button></div>}</div></section>
    <section className="admin-home-card"><header><div><span className="admin-kicker">A MANO</span><h2>Tareas habituales</h2></div></header><div className="admin-shortcuts"><button onClick={() => onSection('access')}><KeyRound size={20}/><span><strong>Gestionar accesos</strong><small>Altas, permisos y cambios de PIN</small></span><ChevronRight size={16}/></button><button onClick={() => onSection('rivals')}><FileUp size={20}/><span><strong>Preparar la temporada</strong><small>Importa rivales y campos por equipo</small></span><ChevronRight size={16}/></button></div><div className="admin-access-note"><ShieldCheck size={18}/><p>{inactive ? `${inactive} ${inactive === 1 ? 'cuenta inactiva' : 'cuentas inactivas'}. Puedes revisar sus accesos en Cuentas y accesos.` : 'Las cuentas y sus accesos se administran desde un único espacio.'}</p></div></section></div>
  </div>;
}
