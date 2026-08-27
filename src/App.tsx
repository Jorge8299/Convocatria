import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  BarChart3, Calendar, Check, ChevronDown, ChevronRight, ClipboardList, Clock,
  Copy, Home, MapPin, Maximize2, PencilRuler, Plane, Plus,
  Save, Send, Settings2, Trash2, Users, X, Archive, UserPlus, Star, Share2, ArrowLeft, LogOut, Search,
} from 'lucide-react';
import type { ClubAccount, FootballStage, TrainingYear } from './clubTypes';
import { clubApi, getStored, StoreArea, StoreRow } from './api';
import { randomFootballPhrase } from './motivational';
import { AgendaEvent, AgendaView, MatchAgendaEvent } from './AgendaView';

type View = 'inicio' | 'agenda' | 'equipo' | 'convocatoria' | 'pizarra' | 'estadisticas' | 'guardados' | 'jugador';
type BoardMode = 'libre' | 'partido';
type SavedTab = 'equipo' | 'convocatorias' | 'pizarras' | 'estadisticas';
type MatchType = 'liga' | 'amistoso' | 'torneo';
interface Rival { id: string; nombre: string; campo: string }
interface Citacion { id: string; hora: string; lugar: string; lugarPersonalizado: string }
interface TournamentMatch { id: string; rival: string; hora: string }
interface Convocatoria {
  equipoPropio: string; tipoPartido: MatchType; rivalId: string; rivalManual: string;
  esCasa: boolean; fecha: string; hora: string; campoPropio: string; campoRival: string;
  campoManual: string; citaciones: Citacion[]; partidosTorneo: TournamentMatch[];
  observaciones: string; playInWhite: boolean; addCierre: boolean; addCorazon: boolean;
}
interface SavedJourney { id: string; createdAt: string; data: Convocatoria; message: string }
interface Player { id: string; name: string; number: string; role: 'jugador' | 'portero'; group: 'plantilla' | 'b'; active: boolean; ownerCoachId?: string; sourceCoachName?: string; sourceTeamLabel?: string }
interface PlayerStat { playerId: string; goals: number; assists: number; rating: number; notes: string }
interface MatchStat { id: string; date: string; rival: string; home: boolean; ourScore: number; rivalScore: number; notes: string; players: PlayerStat[]; updatedAt?: string }
interface TeamData { name: string; season: string; players: Player[] }
interface BoardState { lineups?: BoardLineup[]; [key:string]: unknown }

const CAMPOS_CASA = ['El Morer', 'Campo C', 'Polideportivo'];
const LUGARES_CITACION = ['El Morer', 'Parking del LIDL'];
const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const cloneData = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const TEAM_NAME = 'U.D. OLIVA';
const CREST_PATH = '/escudo-ud-oliva.jpg';
const DEFAULT_TEAM: TeamData = { name: TEAM_NAME, season: '2026/27', players: [] };
const FOOTBALL_STAGE_LABEL: Record<FootballStage, string> = { querubin: 'Querubín', prebenjamin: 'Prebenjamín', benjamin: 'Benjamín', alevin: 'Alevín' };
const TRAINING_YEAR_LABEL: Record<TrainingYear, string> = { primero: 'Primer año', segundo: 'Segundo año', mixto: 'Primer y segundo año' };
const makeInitialForm = (): Convocatoria => ({
  equipoPropio: 'U.D. OLIVA', tipoPartido: 'liga', rivalId: '', rivalManual: '', esCasa: true,
  fecha: '', hora: '', campoPropio: '', campoRival: '', campoManual: '',
  citaciones: [{ id: uid(), hora: '', lugar: '', lugarPersonalizado: '' }],
  partidosTorneo: [{ id: uid(), rival: '', hora: '' }], observaciones: '', playInWhite: false, addCierre: true, addCorazon: true,
});
const formatDate = (value: string) => value
  ? new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00`))
  : 'Fecha pendiente';
const navItems: Array<{ id: View; label: string; icon: React.ElementType }> = [
  { id: 'agenda', label: 'Agenda', icon: Calendar },
  { id: 'equipo', label: 'Equipo', icon: Users },
  { id: 'guardados', label: 'Guardados', icon: Archive },
];

function syncLinkedPlayers(team: TeamData, accountId: string, accounts: ClubAccount[], stores: StoreRow[]): TeamData {
  const sourceTeams = new Map<string, TeamData>();
  accounts.filter((item) => item.role === 'entrenador' && item.id !== accountId).forEach((coach) => sourceTeams.set(coach.id, getStored<TeamData>(stores, coach.id, 'team', DEFAULT_TEAM)));
  return { ...team, players: team.players.map((player) => {
    if (player.group !== 'b' || !player.ownerCoachId || player.ownerCoachId === accountId) return player;
    const source = sourceTeams.get(player.ownerCoachId)?.players.find((item) => item.id === player.id);
    return source ? { ...player, name: source.name, number: source.number, role: source.role, sourceCoachName: accounts.find((item) => item.id === player.ownerCoachId)?.name, sourceTeamLabel: accounts.find((item) => item.id === player.ownerCoachId)?.teamLabel } : player;
  }) };
}

export function CoachApp({ account, accounts, stores, onDataChange, onLogout }: { account: ClubAccount; accounts: ClubAccount[]; stores: StoreRow[]; onDataChange: (area:StoreArea,data:unknown) => Promise<unknown>; onLogout: () => void }) {
  const [view, setView] = useState<View>('inicio');
  const [previousView, setPreviousView] = useState<View>('inicio');
  const [boardMode, setBoardMode] = useState<BoardMode | null>(null);
  const [boardExpanded, setBoardExpanded] = useState(false);
  const [savedTab, setSavedTab] = useState<SavedTab>('equipo');
  const [form, setForm] = useState<Convocatoria>(makeInitialForm);
  const [copySuccess, setCopySuccess] = useState(false);
  const [showRivals, setShowRivals] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [selectedAgendaMatch, setSelectedAgendaMatch] = useState<MatchAgendaEvent | null>(null);
  const [agendaBoardMatch, setAgendaBoardMatch] = useState<MatchAgendaEvent | null>(null);
  const [phrase] = useState(randomFootballPhrase);
  const [rivales, setRivales] = useState<Rival[]>(() => getStored(stores, account.id, 'rivals', []));
  const [journeys, setJourneys] = useState<SavedJourney[]>(() => getStored(stores, account.id, 'journeys', []));
  const [team, setTeam] = useState<TeamData>(() => syncLinkedPlayers({ ...getStored(stores, account.id, 'team', DEFAULT_TEAM), name: TEAM_NAME }, account.id, accounts, stores));
  const [stats, setStats] = useState<MatchStat[]>(() => getStored(stores, account.id, 'stats', []));
  const [boards, setBoards] = useState<BoardState>(() => getStored(stores, account.id, 'boards', {lineups:[]}));
  const [agendaEvents, setAgendaEvents] = useState<AgendaEvent[]>(() => getStored(stores, account.id, 'agenda', []));
  const saveTimer = React.useRef<Record<string,ReturnType<typeof setTimeout>>>({});
  const queueSave = (area:StoreArea,data:unknown) => { clearTimeout(saveTimer.current[area]); saveTimer.current[area]=setTimeout(()=>void onDataChange(area,data),450) };
  useEffect(() => queueSave('rivals',rivales), [rivales]);
  useEffect(() => queueSave('journeys',journeys), [journeys]);
  useEffect(() => queueSave('team',team), [team]);
  useEffect(() => queueSave('stats',stats), [stats]);
  useEffect(() => queueSave('boards',boards), [boards]);
  useEffect(() => queueSave('agenda',agendaEvents), [agendaEvents]);
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.origin === location.origin && event.data?.type === 'convo-pizarra-expanded') setBoardExpanded(Boolean(event.data.expanded));
      if (event.origin === location.origin && event.data?.type === 'convo-pizarra-data') setBoards(event.data.data as BoardState);
    };
    addEventListener('message', listener); return () => removeEventListener('message', listener);
  }, []);

  const selectedRival = rivales.find((r) => r.id === form.rivalId);
  const rivalName = form.tipoPartido === 'liga' ? selectedRival?.nombre || '' : form.rivalManual;
  const fieldName = form.tipoPartido === 'liga' ? (form.esCasa ? form.campoPropio : form.campoRival) : form.campoManual;
  const message = useMemo(() => {
    let text = '';
    if (form.tipoPartido === 'torneo') {
      text = `*🏆 Torneo: ${form.rivalManual || 'Por definir'}*\n📅 *Fecha:* ${form.fecha ? formatDate(form.fecha) : '...'}\n📍 *Lugar:* ${fieldName || '...'}\n\n*Partidos:*\n`;
      form.partidosTorneo.forEach((m) => { text += `⚽ ${m.hora || '...'} h · ${m.rival || 'Rival por definir'}\n` });
    } else {
      const local = form.esCasa ? form.equipoPropio : rivalName || 'Rival';
      const visitor = form.esCasa ? rivalName || 'Rival' : form.equipoPropio;
      text = `*Partido: ${local} vs ${visitor}*\n📆 *Fecha:* ${form.fecha ? formatDate(form.fecha) : '...'}\n⏰ *Hora:* ${form.hora || '...'}\n📍 *Campo:* ${fieldName || '...'}\n`;
    }
    text += '\n'; form.citaciones.forEach((c, i) => { const place = c.lugar === 'Otro' ? c.lugarPersonalizado : c.lugar; text += `📍 *Citación ${i + 1}:* ${c.hora || '...'} en ${place || '...'}\n` });
    text += '\nTodos los niños deben venir con ropa de bonito y deportivas.\nSe ruega máxima puntualidad.\nSi alguien no puede venir, que avise por privado.\n';
    if (form.playInWhite || form.observaciones.trim()) {
      text += '\n📝 *Observaciones:*\n';
      if (form.playInWhite) text += '⚠️ *JUGAMOS DE BLANCO*\n';
      if (form.observaciones.trim()) text += `${form.observaciones.trim()}\n`;
    }
    if (form.addCierre || form.addCorazon) text += `\n${form.addCierre ? '¡Vamos equipo!' : ''}${form.addCorazon ? ' 💙' : ''}`;
    return text;
  }, [fieldName, form, rivalName]);

  const citationTime = (time: string, home: boolean) => {
    if (!time) return ''; const [h, m] = time.split(':').map(Number); const date = new Date(2000, 0, 1, h, m);
    date.setMinutes(date.getMinutes() - (home ? 60 : 90)); return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  };
  const updateTime = (hora: string) => setForm((f) => ({ ...f, hora, citaciones: f.citaciones.map((c, i) => i ? c : { ...c, hora: citationTime(hora, f.esCasa) }) }));
  const updateHome = (esCasa: boolean) => setForm((f) => ({ ...f, esCasa, citaciones: f.citaciones.map((c, i) => i ? c : { ...c, hora: citationTime(f.hora, esCasa) }) }));
  const goToView = (nextView: View) => { if (nextView !== view) { setPreviousView(view); setView(nextView) } };
  const goBack = () => { const destination = previousView; setPreviousView(view); setView(destination) };
  const goHome = () => { setPreviousView(view); setView('inicio') };
  const openAgendaCallup = (event: MatchAgendaEvent) => {
    const initial = makeInitialForm();
    const isLeague = event.matchType === 'liga';
    setForm({
      ...initial,
      tipoPartido: event.matchType,
      rivalId: isLeague ? event.rivalId : '',
      rivalManual: isLeague ? '' : event.rivalName,
      esCasa: event.home,
      fecha: event.date,
      hora: event.startTime,
      campoPropio: isLeague && event.home ? event.field : '',
      campoRival: isLeague && !event.home ? event.field : '',
      campoManual: isLeague ? '' : event.field,
      citaciones: initial.citaciones.map((citation, index) =>
        index === 0
          ? { ...citation, hora: citationTime(event.startTime, event.home) }
          : citation,
      ),
      partidosTorneo:
        event.matchType === 'torneo'
          ? [{ id: uid(), rival: event.rivalName, hora: event.startTime }]
          : initial.partidosTorneo,
      observaciones: event.notes,
      playInWhite: event.playInWhite === true,
    });
    goToView('convocatoria');
  };
  const openBoard = (mode: BoardMode) => { setAgendaBoardMatch(null); setBoardMode(mode); goToView('pizarra') };
  const openAgendaBoard = (event: MatchAgendaEvent) => { setAgendaBoardMatch(event); setBoardMode('partido'); goToView('pizarra') };
  useEffect(() => {
    const returnToAgenda = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.data?.type !== 'convo-pizarra-saved' || !agendaBoardMatch) return;
      setBoardExpanded(false);
      setBoardMode(null);
      setAgendaBoardMatch(null);
      goToView('agenda');
    };
    addEventListener('message', returnToAgenda);
    return () => removeEventListener('message', returnToAgenda);
  }, [agendaBoardMatch]);
  useEffect(() => {
    const resetScroll = () => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      document.querySelector<HTMLElement>('.content')?.scrollTo(0, 0);
    };
    resetScroll();
    const frame = requestAnimationFrame(resetScroll);
    return () => cancelAnimationFrame(frame);
  }, [view, boardMode]);
  const copyMessage = async () => { await navigator.clipboard.writeText(message); setCopySuccess(true); setTimeout(() => setCopySuccess(false), 1800) };
  const saveJourney = () => { setJourneys((list) => [{ id: uid(), createdAt: new Date().toISOString(), data: cloneData(form), message }, ...list]); setSavedTab('convocatorias'); goToView('guardados') };
  const titles: Record<View, [string, string, string]> = {
    inicio: ['U.D. OLIVA', 'Hola, míster', 'Todo lo necesario para el próximo partido, sin complicaciones.'],
    agenda: ['TEMPORADA', 'Agenda', 'Entrenamientos y partidos guardados en el día correspondiente.'],
    equipo: ['TU EQUIPO', 'Equipo y plantilla', 'Configura una vez los jugadores que utilizarás en toda la app.'],
    convocatoria: ['ANTES DEL PARTIDO', 'Citación', 'Completa los datos del partido y comparte el mensaje con el equipo.'],
    pizarra: ['HERRAMIENTA DE CAMPO', 'Pizarra Fútbol 8', 'Tu plantilla disponible para preparar cualquier alineación.'],
    estadisticas: ['DESPUÉS DEL PARTIDO', 'Registrar estadísticas', 'Resultado, goles, asistencias y valoración de cada jugador.'],
    guardados: ['TU ARCHIVO', 'Guardados', 'Plantilla, convocatorias, pizarras y estadísticas en un solo lugar.'],
    jugador: ['PERFIL DEL JUGADOR', 'Estadísticas individuales', 'Evolución y partidos registrados.'],
  };
  return <div className="app-shell">
    <aside className="desktop-sidebar"><Brand account={account} onHome={() => goToView('inicio')} /><nav className="side-nav">{navItems.map((n) => { const Icon = n.icon; return <button key={n.id} className={view === n.id ? 'active' : ''} onClick={() => goToView(n.id)}><Icon size={19} /><span>{n.label}</span></button> })}</nav><div className="storage-note"><span>{account.teamLabel}</span><strong>{account.name}</strong><small>Sesión privada del entrenador.</small><button className="sidebar-logout" onClick={onLogout}><LogOut size={14} /> Cambiar usuario</button></div></aside>
    <header className="mobile-header"><Brand account={account} onHome={goHome} /><button className="mobile-logout" onClick={onLogout} aria-label="Cambiar usuario"><LogOut size={18} /></button></header>
    <main className={`content content-${view}${view === 'pizarra' && boardMode ? ' content-wide' : ''}`}>
      <header className={`page-heading${view !== 'inicio' ? ' has-home-back' : ''}`}>
        {view !== 'inicio' && <button className="icon-button page-home-back" onClick={goHome} aria-label="Volver a la página de inicio"><ArrowLeft size={20} /></button>}
        <div className="page-heading-copy"><span className="eyebrow">{titles[view][0]} · {account.teamLabel}</span><h1>{titles[view][1]}</h1><p>{titles[view][2]}</p></div>
        {view === 'convocatoria' && <div className="heading-actions"><button className="icon-button" onClick={() => setShowRivals(true)} aria-label="Editar rivales"><Settings2 size={20} /></button></div>}
      </header>
      <AnimatePresence mode="wait"><motion.div key={`${view}-${boardMode || ''}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: .18 }}>
        {view === 'inicio' && <HomeView phrase={phrase} onAgenda={() => goToView('agenda')} onTeam={() => goToView('equipo')} onSaved={() => goToView('guardados')} />}
        {view === 'agenda' && <AgendaView events={agendaEvents} rivals={rivales} matches={stats} footballStage={account.footballStage} categoryLabel={`${account.footballStage ? FOOTBALL_STAGE_LABEL[account.footballStage] : 'Categoría pendiente'}${account.trainingYear ? ` · ${TRAINING_YEAR_LABEL[account.trainingYear]}` : ''}`} defaultPlayerCount={team.players.filter((player) => player.active).length} onChange={setAgendaEvents} onOpenCallup={openAgendaCallup} onOpenBoard={openAgendaBoard} onOpenStats={(event) => { const completed = stats.some((match) => match.date === event.date && match.rival === event.rivalName && match.home === event.home); if (completed) { setSavedTab('estadisticas'); goToView('guardados') } else { setSelectedAgendaMatch(event); goToView('estadisticas') } }} />}
        {view === 'equipo' && <TeamView team={team} setTeam={setTeam} account={account} accounts={accounts} stores={stores} onPlayer={(id) => { setSelectedPlayerId(id); goToView('jugador') }} />}
        {view === 'convocatoria' && <ConvocatoriaView form={form} setForm={setForm} rivales={rivales} rivalName={rivalName} fieldName={fieldName} message={message} copySuccess={copySuccess} onCopy={copyMessage} onWhatsApp={() => open(`https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`, '_blank')} onSave={saveJourney} onMatchTime={updateTime} onHomeAway={updateHome} />}
        {view === 'pizarra' && <BoardView mode={boardMode} expanded={boardExpanded} accountId={account.id} boards={boards} team={team} matchContext={agendaBoardMatch} onChoose={setBoardMode} onBack={() => { setBoardExpanded(false); if (agendaBoardMatch) { setAgendaBoardMatch(null); setBoardMode(null); goToView('agenda') } else setBoardMode(null) }} />}
        {view === 'estadisticas' && <StatsView team={team} rivales={rivales} initialMatch={selectedAgendaMatch} onSave={(match) => { setStats((list) => [match, ...list]); setSelectedAgendaMatch(null); setSavedTab('estadisticas'); goToView('guardados') }} />}
        {view === 'guardados' && <SavedView tab={savedTab} setTab={setSavedTab} team={team} rivales={rivales} journeys={journeys} stats={stats} boards={boards} onTeam={() => goToView('equipo')} onOpenBoard={() => openBoard('libre')} onLoadJourney={(j) => { setForm(cloneData(j.data)); goToView('convocatoria') }} onDeleteJourney={(id) => setJourneys((list) => list.filter((j) => j.id !== id))} onDeleteStat={(id) => setStats((list) => list.filter((m) => m.id !== id))} onUpdateStat={(match) => setStats((list) => list.map((item) => item.id === match.id ? match : item))} onOpenPlayer={(id) => { setSelectedPlayerId(id); goToView('jugador') }} />}
        {view === 'jugador' && selectedPlayerId && <PlayerProfile player={team.players.find((p) => p.id === selectedPlayerId)} stats={stats} onBack={goBack} />}
      </motion.div></AnimatePresence>
    </main>
    <RivalsModal open={showRivals} rivals={rivales} setRivals={setRivales} onClose={() => setShowRivals(false)} />
  </div>;
}

function Crest({ className = '' }: { className?: string }) { return <span className={`crest ${className}`}><img src={CREST_PATH} alt="Escudo de U.D. Oliva" /></span> }
function Brand({ account, onHome }: { account: ClubAccount; onHome: () => void }) { return <button type="button" className="brand brand-home" onClick={onHome} aria-label="Ir a la página de inicio"><Crest className="brand-crest" /><span className="brand-copy"><strong>CONVO</strong><small>{account.name} · {account.teamLabel}</small></span></button> }
function HomeView({ phrase, onAgenda, onTeam, onSaved }: { phrase: string; onAgenda: () => void; onTeam: () => void; onSaved: () => void }) { return <div className="home-layout"><section className="hero-card quote-card"><div className="quote-copy"><span className="hero-label">FRASE DEL DÍA</span><h2>“{phrase}”</h2><p>Una idea para empezar la sesión con el equipo en mente.</p></div><Crest className="hero-crest" /></section><section><div className="section-heading"><span className="eyebrow">¿QUÉ NECESITAS HACER?</span><h2>Accesos rápidos</h2></div><div className="action-grid"><ActionCard icon={Calendar} tone="blue" title="Agenda" text="Organiza entrenamientos y partidos." onClick={onAgenda} /><ActionCard icon={Users} tone="violet" title="Equipo" text="Edita la plantilla y los jugadores B." onClick={onTeam} /><ActionCard icon={Archive} tone="green" title="Guardados" text="Consulta convocatorias, pizarras y estadísticas." onClick={onSaved} /></div></section></div> }
function ActionCard({ icon: Icon, tone, title, text, onClick }: { icon: React.ElementType; tone: string; title: string; text: string; onClick: () => void }) { return <button className="action-card" onClick={onClick}><span className={`action-icon ${tone}`}><Icon size={22} /></span><span><strong>{title}</strong><small>{text}</small></span><ChevronRight size={19} /></button> }

function TeamView({ team, setTeam, account, accounts, stores, onPlayer }: { team: TeamData; setTeam: React.Dispatch<React.SetStateAction<TeamData>>; account: ClubAccount; accounts: ClubAccount[]; stores:StoreRow[]; onPlayer: (id: string) => void }) {
  const [draft, setDraft] = useState({ name: '', number: '', role: 'jugador' as Player['role'] });
  const [showBPicker, setShowBPicker] = useState(false);
  const [sourceCoachId, setSourceCoachId] = useState('');
  const [search, setSearch] = useState('');
  const otherCoaches = accounts.filter((item) => item.role === 'entrenador' && item.id !== account.id && item.active);
  const sourceCoach = otherCoaches.find((item) => item.id === sourceCoachId);
  const sourceTeam = sourceCoach ? getStored<TeamData>(stores, sourceCoach.id, 'team', DEFAULT_TEAM) : DEFAULT_TEAM;
  const sourcePlayers = sourceTeam.players.filter((player) => player.group === 'plantilla' && player.active && player.name.toLowerCase().includes(search.toLowerCase()));
  const addPlayer = () => {
    if (!draft.name.trim()) return;
    setTeam((current) => ({ ...current, players: [...current.players, { id: uid(), name: draft.name.trim(), number: draft.number.trim(), role: draft.role, group: 'plantilla', active: true, ownerCoachId: account.id }] }));
    setDraft({ name: '', number: '', role: 'jugador' });
  };
  const linkBPlayer = (player: Player) => {
    if (!sourceCoach || team.players.some((item) => item.id === player.id)) return;
    setTeam((current) => ({ ...current, players: [...current.players, { ...player, group: 'b', ownerCoachId: player.ownerCoachId || sourceCoach.id, sourceCoachName: sourceCoach.name, sourceTeamLabel: sourceCoach.teamLabel, active: true }] }));
  };
  const update = (id: string, change: Partial<Player>) => setTeam((current) => ({ ...current, players: current.players.map((player) => player.id === id ? { ...player, ...change } : player) }));
  const remove = (id: string) => setTeam((current) => ({ ...current, players: current.players.filter((player) => player.id !== id) }));
  return <div className="team-layout">
    <section className="form-card team-identity-card"><div className="form-card-header"><div><span>1</span><h2>Datos del equipo</h2></div><small className="saved-badge"><Check size={14} /> Guardado automático</small></div><div className="form-card-body team-identity"><Crest className="team-crest" /><div><span className="field-label">NOMBRE DEL EQUIPO</span><strong>{TEAM_NAME}</strong><small>{account.teamLabel} · {account.name}</small></div><Field label="Temporada"><input value={team.season} onChange={(event) => setTeam((current) => ({ ...current, season: event.target.value }))} /></Field></div></section>
    <section className="form-card"><div className="form-card-header"><div><span>2</span><h2>Añadir a mi plantilla</h2></div></div><div className="form-card-body"><div className="player-add-grid own-player-grid"><input placeholder="Nombre" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /><input placeholder="Dorsal" value={draft.number} onChange={(event) => setDraft((current) => ({ ...current, number: event.target.value }))} /><select value={draft.role} onChange={(event) => setDraft((current) => ({ ...current, role: event.target.value as Player['role'] }))}><option value="jugador">Jugador</option><option value="portero">Portero</option></select><button className="primary-button" onClick={addPlayer}><UserPlus size={18} /> Añadir</button></div><button className="link-b-button" onClick={() => setShowBPicker((value) => !value)}><Search size={17} /> Buscar jugador B de otro equipo</button>{showBPicker && <div className="b-picker"><div className="field-grid"><Field label="Entrenador de origen"><select value={sourceCoachId} onChange={(event) => setSourceCoachId(event.target.value)}><option value="">Selecciona entrenador</option>{otherCoaches.map((coach) => <option key={coach.id} value={coach.id}>{coach.name} · {coach.teamLabel}</option>)}</select></Field><Field label="Buscar jugador"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nombre del jugador" /></Field></div>{sourceCoachId && <div className="b-player-results">{sourcePlayers.map((player) => <button key={player.id} disabled={team.players.some((item) => item.id === player.id)} onClick={() => linkBPlayer(player)}><span className="player-avatar">{player.number || player.name.slice(0,2).toUpperCase()}</span><span><strong>{player.name}</strong><small>{sourceCoach?.teamLabel} · {player.role === 'portero' ? 'Portero' : 'Jugador'}</small></span><Plus size={17} /></button>)}{!sourcePlayers.length && <div className="inline-empty">No hay jugadores disponibles con esa búsqueda.</div>}</div>}</div>}</div></section>
    {(['plantilla', 'b'] as Player['group'][]).map((group) => <section className="roster-section" key={group}><div className="section-heading"><span className="eyebrow">{group === 'plantilla' ? 'EQUIPO' : 'APOYO'}</span><h2>{group === 'plantilla' ? `Plantilla (${team.players.filter((player) => player.group === group).length})` : `Jugadores B (${team.players.filter((player) => player.group === group).length})`}</h2></div><div className="player-list">{team.players.filter((player) => player.group === group).map((player) => <article className={!player.active ? 'inactive' : ''} key={`${group}-${player.id}`}><div className="player-avatar">{player.number || player.name.slice(0,2).toUpperCase()}</div>{group === 'plantilla' ? <div className="player-edit"><input value={player.name} aria-label={`Nombre de ${player.name}`} onChange={(event) => update(player.id, { name: event.target.value })} /><div><input value={player.number} aria-label={`Dorsal de ${player.name}`} placeholder="#" onChange={(event) => update(player.id, { number: event.target.value })} /><select value={player.role} aria-label={`Posición de ${player.name}`} onChange={(event) => update(player.id, { role: event.target.value as Player['role'] })}><option value="jugador">Jugador</option><option value="portero">Portero</option></select></div></div> : <div className="linked-player-copy"><strong>{player.name}</strong><small>{player.sourceTeamLabel || 'Equipo de origen'} · {player.sourceCoachName || 'Entrenador de origen'}</small><span>Mismo perfil e ID del club</span></div>}<div className="player-actions"><button onClick={() => onPlayer(player.id)}>Ver estadísticas</button><button className={player.active ? '' : 'active-toggle'} onClick={() => update(player.id, { active: !player.active })}>{player.active ? 'Activo' : 'Inactivo'}</button><button className="danger-icon" aria-label={group === 'b' ? `Quitar vínculo de ${player.name}` : `Eliminar ${player.name}`} onClick={() => remove(player.id)}><Trash2 size={17} /></button></div></article>)}{!team.players.some((player) => player.group === group) && <div className="inline-empty">{group === 'plantilla' ? 'Todavía no has añadido jugadores.' : 'No has vinculado jugadores de otros equipos.'}</div>}</div></section>)}
  </div>;
}

const statsMessage = (match: MatchStat, team: TeamData) => {
  const localTeam = match.home !== false ? team.name : match.rival;
  const visitorTeam = match.home !== false ? match.rival : team.name;
  const localScore = match.home !== false ? match.ourScore : match.rivalScore;
  const visitorScore = match.home !== false ? match.rivalScore : match.ourScore;
  let text = `*⚽ ${localTeam} ${localScore} - ${visitorScore} ${visitorTeam}*\n📅 ${formatDate(match.date)}\n\n*ESTADÍSTICAS*\n`;
  const orderedPlayers = [...match.players].sort((a, b) => {
    const aIsKeeper = team.players.find((player) => player.id === a.playerId)?.role === 'portero';
    const bIsKeeper = team.players.find((player) => player.id === b.playerId)?.role === 'portero';
    return Number(bIsKeeper) - Number(aIsKeeper);
  });
  orderedPlayers.forEach((entry) => {
    const player = team.players.find((item) => item.id === entry.playerId); if (!player) return;
    text += `\n*${player.role === 'portero' ? '🧤 PORTERO · ' : ''}${player.name}*\n⚽ Goles: ${entry.goals}\n🎯 Asistencias: ${entry.assists}\n⭐ Valoración: ${entry.rating}/5\n`;
  });
  if (match.notes.trim()) text += `\n*📝 OBSERVACIONES GENERALES*\n${match.notes.trim()}`;
  return text;
};

function StatsView({ team, rivales, initialMatch, onSave }: { team: TeamData; rivales: Rival[]; initialMatch?: MatchAgendaEvent | null; onSave: (match: MatchStat) => void }) {
  const activePlayers = team.players.filter((player) => player.active).sort((a, b) => Number(b.role === 'portero') - Number(a.role === 'portero'));
  const [meta, setMeta] = useState(() => ({ date: initialMatch?.date || '', rival: initialMatch?.rivalName || '', home: initialMatch?.home ?? true, ourScore: 0, rivalScore: 0, notes: initialMatch?.notes || '' }));
  const [entries, setEntries] = useState<Record<string, PlayerStat>>({});
  const [absentIds, setAbsentIds] = useState<Set<string>>(() => new Set());
  const availablePlayers = activePlayers.filter((player) => !absentIds.has(player.id));
  const absentPlayers = activePlayers.filter((player) => absentIds.has(player.id));
  const togglePlayer = (playerId: string) => setEntries((current) => {
    if (current[playerId]) { const next = { ...current }; delete next[playerId]; return next; }
    return { ...current, [playerId]: { playerId, goals: 0, assists: 0, rating: 3, notes: '' } };
  });
  const markAbsent = (playerId: string) => {
    setAbsentIds((current) => new Set(current).add(playerId));
    setEntries((current) => { const next = { ...current }; delete next[playerId]; return next });
  };
  const markAvailable = (playerId: string) => setAbsentIds((current) => { const next = new Set(current); next.delete(playerId); return next });
  const updateEntry = (playerId: string, change: Partial<PlayerStat>) => setEntries((current) => ({ ...current, [playerId]: { ...current[playerId], ...change } }));
  const createMatch = (): MatchStat => ({ id: uid(), ...meta, players: Object.values(entries) });
  if (!activePlayers.length) return <div className="empty-state"><span><Users size={28} /></span><h2>Primero crea tu plantilla</h2><p>Las estadísticas reutilizan los jugadores guardados en Equipo.</p></div>;
  return <div className="stats-layout"><section className="form-card"><div className="form-card-header"><div><span>1</span><h2>Partido</h2></div></div><div className="form-card-body"><div className="field-grid"><Field label="Rival"><div className="select-wrap"><select value={meta.rival} onChange={(event) => setMeta((current) => ({ ...current, rival: event.target.value }))}><option value="">Selecciona un rival</option>{rivales.map((rival) => <option key={rival.id} value={rival.nombre}>{rival.nombre}</option>)}</select><ChevronDown size={18} /></div></Field><Field label="Fecha"><input type="date" value={meta.date} onChange={(event) => setMeta((current) => ({ ...current, date: event.target.value }))} /></Field></div><div className="segmented compact"><button className={meta.home ? 'active' : ''} onClick={() => setMeta((current) => ({ ...current, home: true }))}><Home size={17} /> En casa</button><button className={!meta.home ? 'active' : ''} onClick={() => setMeta((current) => ({ ...current, home: false }))}><Plane size={17} /> Fuera</button></div><MatchScoreEditor home={meta.home} teamName={team.name} rival={meta.rival} ourScore={meta.ourScore} rivalScore={meta.rivalScore} onOurScore={(ourScore) => setMeta((current) => ({ ...current, ourScore }))} onRivalScore={(rivalScore) => setMeta((current) => ({ ...current, rivalScore }))} /><Field label="Observaciones generales"><textarea rows={2} value={meta.notes} onChange={(event) => setMeta((current) => ({ ...current, notes: event.target.value }))} placeholder="Opcional" /></Field></div></section>
    <section><div className="section-heading"><span className="eyebrow">JUGADORES DEL PARTIDO</span><h2>Selecciona y registra</h2></div><div className="stat-player-list">{availablePlayers.map((player) => { const entry = entries[player.id]; return <article className={entry ? 'selected' : ''} key={player.id}><div className="stat-player-top"><button className="stat-player-head" onClick={() => togglePlayer(player.id)}><span className="player-avatar">{player.number || player.name.slice(0, 2).toUpperCase()}</span><span><strong>{player.name}</strong><small>{player.group === 'b' ? 'Jugador B' : player.role === 'portero' ? 'Portero' : 'Plantilla'}</small></span><span className="selection-check">{entry ? <Check size={17} /> : <Plus size={17} />}</span></button><button className="stat-absent-button" onClick={() => markAbsent(player.id)}>Ausente</button></div>{entry && <div className="stat-fields"><div className="field"><span>Goles</span><NumberControl label={`Goles de ${player.name}`} value={entry.goals} onChange={(goals) => updateEntry(player.id, { goals })} /></div><div className="field"><span>Asistencias</span><NumberControl label={`Asistencias de ${player.name}`} value={entry.assists} onChange={(assists) => updateEntry(player.id, { assists })} /></div><Field label="Valoración"><select value={entry.rating} onChange={(event) => updateEntry(player.id, { rating: Number(event.target.value) })}>{[1,2,3,4,5].map((value) => <option key={value} value={value}>{value}/5</option>)}</select></Field><Field label="Observaciones"><input value={entry.notes} onChange={(event) => updateEntry(player.id, { notes: event.target.value })} placeholder="Opcional" /></Field></div>}</article> })}</div>{absentPlayers.length > 0 && <div className="absent-stat-section"><div><span className="eyebrow">AUSENTES ({absentPlayers.length})</span><small>No cuentan como partido jugado ni entran en ninguna media.</small></div><div className="absent-stat-list">{absentPlayers.map((player) => <button key={player.id} onClick={() => markAvailable(player.id)}><span className="player-avatar">{player.number || player.name.slice(0, 2).toUpperCase()}</span><span><strong>{player.name}</strong><small>Marcar disponible</small></span><Plus size={16} /></button>)}</div></div>}</section>
    <div className="sticky-actions"><button className="secondary-button" disabled={!Object.keys(entries).length} onClick={() => open(`https://api.whatsapp.com/send?text=${encodeURIComponent(statsMessage(createMatch(), team))}`, '_blank')}><Share2 size={18} /> Compartir WhatsApp</button><button className="primary-button" disabled={!meta.rival.trim() || !Object.keys(entries).length} onClick={() => onSave(createMatch())}><Save size={18} /> Guardar estadísticas</button></div>
  </div>;
}

interface BoardLineup { id: string; name: string; positions?: Array<{ id: string; onField: boolean }> }

type RankingSort = 'rating' | 'goals' | 'assists' | 'matches';
function SavedMatchEditor({ match, team, rivales, onCancel, onSave }: { match: MatchStat; team: TeamData; rivales: Rival[]; onCancel: () => void; onSave: (match: MatchStat) => void }) {
  const [draft, setDraft] = useState<MatchStat>(() => cloneData(match));
  const players = [...team.players].sort((a, b) => Number(b.role === 'portero') - Number(a.role === 'portero') || a.name.localeCompare(b.name, 'es'));
  const selected = new Map<string, PlayerStat>(draft.players.map((entry) => [entry.playerId, entry]));
  const updateEntry = (playerId: string, change: Partial<PlayerStat>) => setDraft((current) => ({ ...current, players: current.players.map((entry) => entry.playerId === playerId ? { ...entry, ...change } : entry) }));
  const togglePlayer = (playerId: string) => setDraft((current) => ({ ...current, players: current.players.some((entry) => entry.playerId === playerId) ? current.players.filter((entry) => entry.playerId !== playerId) : [...current.players, { playerId, goals: 0, assists: 0, rating: 3, notes: '' }] }));
  const rivalOptions = rivales.some((rival) => rival.nombre === draft.rival) || !draft.rival ? rivales : [{ id: `saved-${draft.id}`, nombre: draft.rival, campo: '' }, ...rivales];
  return <div className="saved-match-editor">
    <div className="editor-heading"><button className="text-button" onClick={onCancel}><ArrowLeft size={17} /> Volver a partidos</button><div><span className="eyebrow">EDITANDO PARTIDO</span><h2>{draft.home !== false ? `${team.name} vs ${draft.rival}` : `${draft.rival} vs ${team.name}`}</h2><p>Los cambios sustituirán las estadísticas guardadas.</p></div></div>
    <section className="form-card"><div className="form-card-header"><div><span>1</span><h2>Datos del partido</h2></div></div><div className="form-card-body"><div className="field-grid"><Field label="Rival"><div className="select-wrap"><select value={draft.rival} onChange={(event) => setDraft((current) => ({ ...current, rival: event.target.value }))}><option value="">Selecciona un rival</option>{rivalOptions.map((rival) => <option key={rival.id} value={rival.nombre}>{rival.nombre}</option>)}</select><ChevronDown size={18} /></div></Field><Field label="Fecha"><input type="date" value={draft.date} onChange={(event) => setDraft((current) => ({ ...current, date: event.target.value }))} /></Field></div><div className="segmented compact"><button className={draft.home !== false ? 'active' : ''} onClick={() => setDraft((current) => ({ ...current, home: true }))}><Home size={17} /> En casa</button><button className={draft.home === false ? 'active' : ''} onClick={() => setDraft((current) => ({ ...current, home: false }))}><Plane size={17} /> Fuera</button></div><MatchScoreEditor home={draft.home !== false} teamName={team.name} rival={draft.rival} ourScore={draft.ourScore} rivalScore={draft.rivalScore} onOurScore={(ourScore) => setDraft((current) => ({ ...current, ourScore }))} onRivalScore={(rivalScore) => setDraft((current) => ({ ...current, rivalScore }))} /><Field label="Observaciones generales"><textarea rows={3} value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} placeholder="Opcional" /></Field></div></section>
    <section><div className="section-heading"><span className="eyebrow">JUGADORES DEL PARTIDO</span><h2>Corrige las estadísticas</h2></div><div className="stat-player-list">{players.map((player) => { const entry = selected.get(player.id); return <article className={entry ? 'selected' : ''} key={player.id}><button className="stat-player-head" onClick={() => togglePlayer(player.id)}><span className="player-avatar">{player.number || player.name.slice(0, 2).toUpperCase()}</span><span><strong>{player.name}</strong><small>{player.role === 'portero' ? 'Portero' : player.group === 'b' ? 'Jugador B' : 'Plantilla'}</small></span><span className="selection-check">{entry ? <Check size={17} /> : <Plus size={17} />}</span></button>{entry && <div className="stat-fields"><div className="field"><span>Goles</span><NumberControl label={`Goles de ${player.name}`} value={entry.goals} onChange={(goals) => updateEntry(player.id, { goals })} /></div><div className="field"><span>Asistencias</span><NumberControl label={`Asistencias de ${player.name}`} value={entry.assists} onChange={(assists) => updateEntry(player.id, { assists })} /></div><Field label="Valoración"><select value={entry.rating} onChange={(event) => updateEntry(player.id, { rating: Number(event.target.value) })}>{[1,2,3,4,5].map((value) => <option key={value} value={value}>{value}/5</option>)}</select></Field><Field label="Observaciones"><input value={entry.notes} onChange={(event) => updateEntry(player.id, { notes: event.target.value })} placeholder="Opcional" /></Field></div>}</article> })}</div></section>
    <div className="sticky-actions"><button className="secondary-button" disabled={!draft.players.length} onClick={() => open(`https://api.whatsapp.com/send?text=${encodeURIComponent(statsMessage(draft, team))}`, '_blank')}><Share2 size={18} /> Compartir WhatsApp</button><button className="primary-button" disabled={!draft.rival.trim() || !draft.players.length} onClick={() => onSave({ ...draft, updatedAt: new Date().toISOString() })}><Save size={18} /> Guardar cambios</button></div>
  </div>;
}

function StatsLibrary({ team, rivales, stats, onDeleteStat, onUpdateStat, onOpenPlayer }: { team: TeamData; rivales: Rival[]; stats: MatchStat[]; onDeleteStat: (id: string) => void; onUpdateStat: (match: MatchStat) => void; onOpenPlayer: (id: string) => void }) {
  const [mode, setMode] = useState<'partidos' | 'clasificacion'>('partidos');
  const [sortBy, setSortBy] = useState<RankingSort>('rating');
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingMatch = stats.find((match) => match.id === editingId);
  const ranking = team.players.map((player) => {
    const entries = stats.flatMap((match) => match.players.filter((entry) => entry.playerId === player.id));
    const goals = entries.reduce((total, entry) => total + entry.goals, 0);
    const assists = entries.reduce((total, entry) => total + entry.assists, 0);
    const rating = entries.length ? entries.reduce((total, entry) => total + entry.rating, 0) / entries.length : 0;
    return { player, matches: entries.length, goals, assists, rating };
  }).sort((a, b) => b[sortBy] - a[sortBy] || a.player.name.localeCompare(b.player.name, 'es'));
  const sortLabels: Array<[RankingSort, string]> = [['rating', 'Valoración'], ['goals', 'Goles'], ['assists', 'Asistencias'], ['matches', 'Partidos']];
  if (editingMatch) return <SavedMatchEditor match={editingMatch} team={team} rivales={rivales} onCancel={() => setEditingId(null)} onSave={(updated) => { onUpdateStat(updated); setEditingId(null) }} />;
  return <div className="stats-library">
    <div className="stats-view-toggle"><button className={mode === 'partidos' ? 'active' : ''} onClick={() => setMode('partidos')}>Partidos</button><button className={mode === 'clasificacion' ? 'active' : ''} onClick={() => setMode('clasificacion')}>Clasificación</button></div>
    {mode === 'partidos' ? <div className="journey-list">{stats.map((match) => <article key={match.id}><div className="date-block"><strong>{match.home !== false ? match.ourScore : match.rivalScore}</strong><span>{match.home !== false ? match.rivalScore : match.ourScore}</span></div><div><span className="journey-type">{formatDate(match.date)}</span><h2>{match.home !== false ? `${team.name} vs ${match.rival}` : `${match.rival} vs ${team.name}`}</h2><p>{match.players.length} jugadores registrados{match.updatedAt ? ' · Editado' : ''}</p></div><div className="journey-actions"><button className="edit-stat-button" onClick={() => setEditingId(match.id)}><PencilRuler size={16} /> Editar</button><button aria-label={`Compartir partido contra ${match.rival}`} onClick={() => open(`https://api.whatsapp.com/send?text=${encodeURIComponent(statsMessage(match,team))}`,'_blank')}><Send size={16} /></button><button aria-label={`Eliminar partido contra ${match.rival}`} onClick={() => onDeleteStat(match.id)}><Trash2 size={16} /></button></div><div className="saved-stat-players">{match.players.map((entry) => { const player = team.players.find((p) => p.id === entry.playerId); return player && <button key={entry.playerId} onClick={() => onOpenPlayer(entry.playerId)}><strong>{player.name}</strong><span>⚽ {entry.goals} · 🎯 {entry.assists} · ⭐ {entry.rating}/5</span></button> })}</div></article>)}{!stats.length && <InlineEmpty text="No hay estadísticas guardadas." />}</div> : <div className="ranking-view"><div className="ranking-sort"><span>Ordenar por</span>{sortLabels.map(([value, label]) => <button key={value} className={sortBy === value ? 'active' : ''} onClick={() => setSortBy(value)}>{label}</button>)}</div><div className="ranking-head"><span>Jugador</span><span>PJ</span><span>G</span><span>A</span><span>Media</span></div><div className="ranking-list">{ranking.map((row, index) => <button key={row.player.id} onClick={() => onOpenPlayer(row.player.id)}><span className="ranking-player-cell"><span className="ranking-position">{index + 1}</span><span className="player-avatar">{row.player.number || row.player.name.slice(0, 2).toUpperCase()}</span><span className="ranking-player"><strong>{row.player.name}</strong><small>{row.player.group === 'b' ? 'Jugador B' : row.player.role === 'portero' ? 'Portero' : 'Plantilla'}</small></span></span><span>{row.matches}</span><span>{row.goals}</span><span>{row.assists}</span><strong className="ranking-rating">{row.matches ? row.rating.toFixed(1) : '—'}</strong></button>)}{!ranking.length && <InlineEmpty text="Todavía no hay jugadores en el equipo." />}</div></div>}
  </div>;
}

function SavedView({ tab, setTab, team, rivales, journeys, stats, boards, onTeam, onOpenBoard, onLoadJourney, onDeleteJourney, onDeleteStat, onUpdateStat, onOpenPlayer }: { tab: SavedTab; setTab: React.Dispatch<React.SetStateAction<SavedTab>>; team: TeamData; rivales: Rival[]; journeys: SavedJourney[]; stats: MatchStat[]; boards:BoardState; onTeam: () => void; onOpenBoard: () => void; onLoadJourney: (j: SavedJourney) => void; onDeleteJourney: (id: string) => void; onDeleteStat: (id: string) => void; onUpdateStat: (match: MatchStat) => void; onOpenPlayer: (id: string) => void }) {
  const savedBoards = boards.lineups || [];
  return <div className="saved-layout"><div className="saved-tabs"><button className={tab === 'equipo' ? 'active' : ''} onClick={() => setTab('equipo')}>Equipo</button><button className={tab === 'convocatorias' ? 'active' : ''} onClick={() => setTab('convocatorias')}>Convocatorias</button><button className={tab === 'pizarras' ? 'active' : ''} onClick={() => setTab('pizarras')}>Pizarras</button><button className={tab === 'estadisticas' ? 'active' : ''} onClick={() => setTab('estadisticas')}>Estadísticas</button></div>
    {tab === 'equipo' && <div className="saved-grid"><button className="library-summary" onClick={onTeam}><Users size={24} /><span><strong>{team.name}</strong><small>{team.players.filter((p) => p.group === 'plantilla').length} jugadores · {team.players.filter((p) => p.group === 'b').length} jugadores B</small></span><ChevronRight /></button>{team.players.map((player) => <button className="library-player" key={player.id} onClick={() => onOpenPlayer(player.id)}><span className="player-avatar">{player.number || player.name.slice(0,2).toUpperCase()}</span><span><strong>{player.name}</strong><small>{player.group === 'b' ? 'Jugador B' : player.role === 'portero' ? 'Portero' : 'Plantilla'}</small></span><ChevronRight size={17} /></button>)}</div>}
    {tab === 'convocatorias' && <div className="journey-list">{journeys.map((journey) => <article key={journey.id}><div className="date-block"><strong>{journey.data.fecha ? new Date(`${journey.data.fecha}T12:00:00`).getDate() : '—'}</strong><span>{journey.data.fecha ? new Intl.DateTimeFormat('es-ES',{month:'short'}).format(new Date(`${journey.data.fecha}T12:00:00`)) : 'fecha'}</span></div><div><span className="journey-type">{journey.data.tipoPartido}</span><h2>{journey.data.rivalManual || 'Convocatoria guardada'}</h2><p>{journey.data.hora || '--:--'}</p></div><div className="journey-actions"><button onClick={() => onLoadJourney(journey)}>Ver</button><button onClick={() => open(`https://api.whatsapp.com/send?text=${encodeURIComponent(journey.message)}`,'_blank')}><Send size={16} /></button><button onClick={() => onDeleteJourney(journey.id)}><Trash2 size={16} /></button></div></article>)}{!journeys.length && <InlineEmpty text="No hay convocatorias guardadas." />}</div>}
    {tab === 'pizarras' && <div className="journey-list">{savedBoards.map((board) => <article key={board.id}><div className="date-block"><PencilRuler size={22} /></div><div><span className="journey-type">Pizarra</span><h2>{board.name}</h2><p>{board.positions?.filter((p) => p.onField).length || 0} jugadores en campo</p></div><div className="journey-actions"><button onClick={onOpenBoard}>Ver</button><button onClick={() => { const names = board.positions?.filter((p) => p.onField).map((position) => team.players.find((player) => player.id === position.id)?.name).filter(Boolean).join(', ') || 'Sin jugadores'; open(`https://api.whatsapp.com/send?text=${encodeURIComponent(`*${board.name}*\n${names}`)}`,'_blank') }}><Send size={16} /></button></div></article>)}{!savedBoards.length && <InlineEmpty text="No hay pizarras guardadas." />}</div>}
    {tab === 'estadisticas' && <StatsLibrary team={team} rivales={rivales} stats={stats} onDeleteStat={onDeleteStat} onUpdateStat={onUpdateStat} onOpenPlayer={onOpenPlayer} />}
  </div>;
}

function InlineEmpty({ text }: { text: string }) { return <div className="inline-empty">{text}</div> }

function PlayerProfile({ player, stats, onBack }: { player?: Player; stats: MatchStat[]; onBack: () => void }) {
  if (!player) return <InlineEmpty text="No se encontró el jugador." />;
  const matches = stats.filter((match) => match.players.some((entry) => entry.playerId === player.id));
  const entries = matches.map((match) => ({ match, entry: match.players.find((item) => item.playerId === player.id)! }));
  const totalGoals = entries.reduce((sum, item) => sum + item.entry.goals, 0); const totalAssists = entries.reduce((sum, item) => sum + item.entry.assists, 0);
  const avgRating = entries.length ? entries.reduce((sum, item) => sum + item.entry.rating, 0) / entries.length : 0; const best = entries.length ? Math.max(...entries.map((item) => item.entry.rating)) : 0;
  return <div className="profile-layout"><button className="text-button" onClick={onBack}><ArrowLeft size={17} /> Volver a la pantalla anterior</button><section className="profile-hero"><div className="player-avatar large">{player.number || player.name.slice(0,2).toUpperCase()}</div><div><span>{player.group === 'b' ? 'Jugador B' : player.role === 'portero' ? 'Portero' : 'Plantilla'}</span><h2>{player.name}</h2></div></section><div className="metric-grid"><Metric label="Partidos" value={entries.length} /><Metric label="Goles" value={totalGoals} /><Metric label="Asistencias" value={totalAssists} /><Metric label="Valoración media" value={avgRating ? avgRating.toFixed(1) : '—'} /><Metric label="Goles por partido" value={entries.length ? (totalGoals / entries.length).toFixed(2) : '—'} /><Metric label="Asist. por partido" value={entries.length ? (totalAssists / entries.length).toFixed(2) : '—'} /><Metric label="Mejor valoración" value={best ? `${best}/5` : '—'} /></div><section><div className="section-heading"><span className="eyebrow">HISTORIAL</span><h2>Partido a partido</h2></div><div className="player-history">{entries.map(({ match, entry }) => <article key={match.id}><div><strong>{match.home !== false ? `${TEAM_NAME} vs ${match.rival}` : `${match.rival} vs ${TEAM_NAME}`}</strong><small>{formatDate(match.date)} · {match.home !== false ? `${match.ourScore}-${match.rivalScore}` : `${match.rivalScore}-${match.ourScore}`}</small></div><span>⚽ {entry.goals}</span><span>🎯 {entry.assists}</span><span>⭐ {entry.rating}/5</span>{entry.notes && <p>{entry.notes}</p>}</article>)}{!entries.length && <InlineEmpty text="Aún no hay partidos registrados para este jugador." />}</div></section></div>;
}
function Metric({ label, value }: { label: string; value: string | number }) { return <div className="metric"><strong>{value}</strong><span>{label}</span></div> }

interface FormProps { form: Convocatoria; setForm: React.Dispatch<React.SetStateAction<Convocatoria>>; rivales: Rival[]; rivalName: string; fieldName: string; message: string; copySuccess: boolean; onCopy: () => void; onWhatsApp: () => void; onSave: () => void; onMatchTime: (v: string) => void; onHomeAway: (v: boolean) => void }
function ConvocatoriaView({ form, setForm, rivales, rivalName, fieldName, message, copySuccess, onCopy, onWhatsApp, onSave, onMatchTime, onHomeAway }: FormProps) {
  const updateCitation = (id: string, field: keyof Citacion, value: string) => setForm((f) => ({ ...f, citaciones: f.citaciones.map((c) => c.id === id ? { ...c, [field]: value } : c) }));
  const local = form.esCasa ? form.equipoPropio : rivalName || 'Rival'; const visitor = form.esCasa ? rivalName || 'Rival por definir' : form.equipoPropio;
  return <div className="form-layout"><div className="form-column">
    <div className="segmented">{(['liga', 'amistoso', 'torneo'] as MatchType[]).map((type) => <button key={type} className={form.tipoPartido === type ? 'active' : ''} onClick={() => setForm((f) => ({ ...f, tipoPartido: type }))}>{type[0].toUpperCase() + type.slice(1)}</button>)}</div>
    {form.tipoPartido !== 'torneo' && <div className="segmented compact"><button className={form.esCasa ? 'active' : ''} onClick={() => onHomeAway(true)}><Home size={17} /> En casa</button><button className={!form.esCasa ? 'active' : ''} onClick={() => onHomeAway(false)}><Plane size={17} /> Fuera</button></div>}
    <FormCard title="Partido" step="1">
      {form.tipoPartido === 'liga' ? <Field label="Rival"><div className="select-wrap"><select value={form.rivalId} onChange={(e) => { const r = rivales.find((x) => x.id === e.target.value); setForm((f) => ({ ...f, rivalId: e.target.value, campoRival: r?.campo || f.campoRival })) }}><option value="">Selecciona un rival</option>{rivales.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}</select><ChevronDown size={18} /></div></Field> : <Field label={form.tipoPartido === 'torneo' ? 'Nombre del torneo' : 'Rival'}><input value={form.rivalManual} onChange={(e) => setForm((f) => ({ ...f, rivalManual: e.target.value }))} placeholder="Escribe el nombre" /></Field>}
      <div className="field-grid"><Field label="Fecha" icon={Calendar}><input type="date" value={form.fecha} onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))} /></Field>{form.tipoPartido !== 'torneo' && <Field label="Hora" icon={Clock}><input type="time" value={form.hora} onChange={(e) => onMatchTime(e.target.value)} /></Field>}</div>
      <Field label={form.tipoPartido === 'torneo' ? 'Lugar' : 'Campo'} icon={MapPin}>{form.tipoPartido === 'liga' && form.esCasa ? <div className="select-wrap"><select value={form.campoPropio} onChange={(e) => setForm((f) => ({ ...f, campoPropio: e.target.value }))}><option value="">Selecciona el campo</option>{CAMPOS_CASA.map((x) => <option key={x}>{x}</option>)}</select><ChevronDown size={18} /></div> : <input value={form.tipoPartido === 'liga' ? form.campoRival : form.campoManual} onChange={(e) => setForm((f) => ({ ...f, [form.tipoPartido === 'liga' ? 'campoRival' : 'campoManual']: e.target.value }))} placeholder="Campo o lugar" />}</Field>
    </FormCard>
    {form.tipoPartido === 'torneo' && <FormCard title="Partidos del torneo" step="2" action={<button className="text-button" onClick={() => setForm((f) => ({ ...f, partidosTorneo: [...f.partidosTorneo, { id: uid(), rival: '', hora: '' }] }))}><Plus size={16} /> Añadir</button>}>{form.partidosTorneo.map((m) => <div className="inline-row" key={m.id}><input type="time" value={m.hora} onChange={(e) => setForm((f) => ({ ...f, partidosTorneo: f.partidosTorneo.map((x) => x.id === m.id ? { ...x, hora: e.target.value } : x) }))} /><input value={m.rival} placeholder="Rival" onChange={(e) => setForm((f) => ({ ...f, partidosTorneo: f.partidosTorneo.map((x) => x.id === m.id ? { ...x, rival: e.target.value } : x) }))} /></div>)}</FormCard>}
    <FormCard title="Citación" step={form.tipoPartido === 'torneo' ? '3' : '2'} action={<button className="text-button" onClick={() => setForm((f) => ({ ...f, citaciones: [...f.citaciones, { id: uid(), hora: '', lugar: '', lugarPersonalizado: '' }] }))}><Plus size={16} /> Añadir</button>}>{form.citaciones.map((c, i) => <div className="citation" key={c.id}><div className="citation-number">{i + 1}</div><div className="field-grid"><Field label="Hora"><input type="time" value={c.hora} onChange={(e) => updateCitation(c.id, 'hora', e.target.value)} /></Field><Field label="Lugar"><div className="select-wrap"><select value={c.lugar} onChange={(e) => updateCitation(c.id, 'lugar', e.target.value)}><option value="">Selecciona</option>{LUGARES_CITACION.map((x) => <option key={x}>{x}</option>)}<option value="Otro">Otro lugar</option></select><ChevronDown size={17} /></div></Field></div>{c.lugar === 'Otro' && <input value={c.lugarPersonalizado} onChange={(e) => updateCitation(c.id, 'lugarPersonalizado', e.target.value)} placeholder="Escribe el lugar" />}{form.citaciones.length > 1 && <button className="remove-button" onClick={() => setForm((f) => ({ ...f, citaciones: f.citaciones.filter((x) => x.id !== c.id) }))}><X size={16} /></button>}</div>)}</FormCard>
    <FormCard title="Detalles finales" step={form.tipoPartido === 'torneo' ? '4' : '3'}><div className="match-observations-group"><Field label="Observaciones"><textarea rows={3} value={form.observaciones} onChange={(e) => setForm((f) => ({ ...f, observaciones: e.target.value }))} placeholder="Equipación, documentación, indicaciones…" /></Field><label className={`white-kit-toggle${form.playInWhite ? ' active' : ''}`}><input type="checkbox" checked={form.playInWhite === true} onChange={(e) => setForm((f) => ({ ...f, playInWhite: e.target.checked }))} /><span aria-hidden="true" /><strong>Añadir en observaciones: JUGAMOS DE BLANCO</strong></label></div><div className="switch-row"><label><input type="checkbox" checked={form.addCierre} onChange={(e) => setForm((f) => ({ ...f, addCierre: e.target.checked }))} /><span />Añadir “¡Vamos equipo!”</label><label><input type="checkbox" checked={form.addCorazon} onChange={(e) => setForm((f) => ({ ...f, addCorazon: e.target.checked }))} /><span />Añadir corazón azul</label></div></FormCard>
  </div><aside className="preview-column"><div className="match-summary"><div className="match-summary-top"><span>{form.tipoPartido.toUpperCase()}</span><small>{formatDate(form.fecha)}</small></div><div className="teams"><strong>{form.tipoPartido === 'torneo' ? form.rivalManual || 'Torneo por definir' : local}</strong>{form.tipoPartido !== 'torneo' && <><span>VS</span><strong>{visitor}</strong></>}</div><div className="match-meta"><span><Clock size={15} />{form.hora || '--:--'}</span><span><MapPin size={15} />{fieldName || 'Campo pendiente'}</span></div></div><div className="message-card"><div className="message-card-header"><span>Mensaje para el equipo</span><button onClick={onCopy}>{copySuccess ? <><Check size={16} /> Copiado</> : <><Copy size={16} /> Copiar</>}</button></div><pre>{message}</pre></div><div className="preview-actions"><button className="secondary-button" onClick={onSave}><Save size={18} /> Guardar jornada</button><button className="whatsapp-button" onClick={onWhatsApp}><Send size={18} /> Abrir WhatsApp</button></div></aside></div>;
}
function FormCard({ title, step, action, children }: { title: string; step: string; action?: React.ReactNode; children: React.ReactNode }) { return <section className="form-card"><div className="form-card-header"><div><span>{step}</span><h2>{title}</h2></div>{action}</div><div className="form-card-body">{children}</div></section> }
function MatchScoreEditor({ home, teamName, rival, ourScore, rivalScore, onOurScore, onRivalScore }: { home: boolean; teamName: string; rival: string; ourScore: number; rivalScore: number; onOurScore: (value: number) => void; onRivalScore: (value: number) => void }) {
  const ourTeam = <div><span>{teamName}</span><NumberControl label={`Goles de ${teamName}`} value={ourScore} onChange={onOurScore} /></div>;
  const rivalTeam = <div><span>{rival || 'Rival'}</span><NumberControl label={`Goles de ${rival || 'Rival'}`} value={rivalScore} onChange={onRivalScore} /></div>;
  return <div className="score-input">{home ? <>{ourTeam}<strong>—</strong>{rivalTeam}</> : <>{rivalTeam}<strong>—</strong>{ourTeam}</>}</div>;
}
function NumberControl({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <div className="number-control"><button type="button" aria-label={`Restar uno a ${label}`} disabled={value <= 0} onClick={() => onChange(Math.max(0, value - 1))}>−</button><input aria-label={label} type="text" inputMode="numeric" pattern="[0-9]*" value={value} onFocus={(event) => event.currentTarget.select()} onChange={(event) => { const digits = event.target.value.replace(/\D/g, ''); onChange(digits ? Number(digits) : 0) }} /><button type="button" aria-label={`Sumar uno a ${label}`} onClick={() => onChange(value + 1)}>+</button></div>
}
function Field({ label, icon: Icon, children }: { label: string; icon?: React.ElementType; children: React.ReactNode }) { return <label className="field"><span>{Icon && <Icon size={14} />}{label}</span>{children}</label> }
function BoardView({ mode, expanded, accountId, boards, team, matchContext, onChoose, onBack }: { mode: BoardMode | null; expanded: boolean; accountId: string; boards:BoardState; team:TeamData; matchContext?: MatchAgendaEvent | null; onChoose: (m: BoardMode) => void; onBack: () => void }) { const frame=React.useRef<HTMLIFrameElement>(null); const sendBoards=()=>frame.current?.contentWindow?.postMessage({type:'convo-pizarra-init',data:{boards,team,matchContext}},location.origin); if (!mode) return <div className="board-choice"><ActionCard icon={PencilRuler} tone="green" title="Pizarra libre" text="Una mesa de trabajo rápida. No necesita rival, fecha ni convocatoria." onClick={() => onChoose('libre')} /><ActionCard icon={ClipboardList} tone="blue" title="Preparar un partido" text="Convocados, alineación guardada y estadísticas después del encuentro." onClick={() => onChoose('partido')} /></div>; const contextQuery=matchContext?`&context=agenda&event=${encodeURIComponent(matchContext.id)}`:''; return <div className={expanded ? 'board-overlay' : 'board-container'}>{!expanded && <div className="board-toolbar"><button className="text-button" onClick={onBack}>← {matchContext ? 'Volver a la agenda' : 'Elegir otro modo'}</button><span><Maximize2 size={16} /> “Campo completo” ocupará toda la pantalla</span></div>}<iframe ref={frame} onLoad={sendBoards} title={mode === 'libre' ? 'Pizarra libre' : 'Pizarra de partido'} src={`/pizarra.html?mode=${mode}&account=${encodeURIComponent(accountId)}${contextQuery}`} allow="fullscreen" allowFullScreen /></div> }
function JourneysView({ journeys, onNew, onLoad, onDelete }: { journeys: SavedJourney[]; onNew: () => void; onLoad: (j: SavedJourney) => void; onDelete: (id: string) => void }) { if (!journeys.length) return <div className="empty-state"><span><Calendar size={28} /></span><h2>Aún no hay jornadas</h2><p>Guarda una convocatoria cuando quieras volver a consultarla.</p><button className="primary-button" onClick={onNew}><Plus size={18} /> Crear convocatoria</button></div>; return <div className="journey-list">{journeys.map((j) => <article key={j.id}><div className="date-block"><strong>{j.data.fecha ? new Date(`${j.data.fecha}T12:00:00`).getDate() : '—'}</strong><span>{j.data.fecha ? new Intl.DateTimeFormat('es-ES', { month: 'short' }).format(new Date(`${j.data.fecha}T12:00:00`)) : 'sin fecha'}</span></div><div><span className="journey-type">{j.data.tipoPartido}</span><h2>{j.data.rivalManual || 'Convocatoria guardada'}</h2><p>{j.data.hora || '--:--'} · {j.data.campoPropio || j.data.campoRival || j.data.campoManual || 'Campo pendiente'}</p></div><div className="journey-actions"><button onClick={() => onLoad(j)}>Abrir</button><button onClick={() => onDelete(j.id)} aria-label="Eliminar"><Trash2 size={17} /></button></div></article>)}</div> }
function RivalsModal({ open, rivals, setRivals, onClose }: { open: boolean; rivals: Rival[]; setRivals: React.Dispatch<React.SetStateAction<Rival[]>>; onClose: () => void }) { return <AnimatePresence>{open && <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><motion.div className="modal" initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }}><header><div><span className="eyebrow">CONFIGURACIÓN</span><h2>Rivales</h2></div><button className="icon-button" onClick={onClose}><X size={20} /></button></header><div className="rival-list">{rivals.map((r) => <div className="rival-row" key={r.id}><input value={r.nombre} onChange={(e) => setRivals((list) => list.map((x) => x.id === r.id ? { ...x, nombre: e.target.value } : x))} /><input value={r.campo} onChange={(e) => setRivals((list) => list.map((x) => x.id === r.id ? { ...x, campo: e.target.value } : x))} /><button onClick={() => setRivals((list) => list.filter((x) => x.id !== r.id))}><Trash2 size={17} /></button></div>)}</div><footer><button className="text-button" onClick={() => setRivals((list) => [...list, { id: uid(), nombre: 'Nuevo rival', campo: '' }])}><Plus size={17} /> Añadir rival</button><button className="primary-button" onClick={onClose}>Listo</button></footer></motion.div></motion.div>}</AnimatePresence> }
