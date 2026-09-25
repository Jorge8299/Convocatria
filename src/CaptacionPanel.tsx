import { useState, type FormEvent } from 'react';
import { Plus, Trash2, UserSearch } from 'lucide-react';

export type ContactPossibility = 'si' | 'no' | 'por-confirmar';
export interface ScoutedPlayer { id: string; name: string; category: string; team: string; position: string; contact: ContactPossibility; notes: string; createdAt: string }

const emptyDraft = () => ({ name: '', category: '', team: '', position: '', contact: 'por-confirmar' as ContactPossibility, notes: '' });
const contactLabel: Record<ContactPossibility, string> = { si: 'Sí', no: 'No', 'por-confirmar': 'Por confirmar' };

export function CoachCaptacionPanel({ players, onChange }: { players: ScoutedPlayer[]; onChange: (players: ScoutedPlayer[]) => void }) {
  const [draft, setDraft] = useState(emptyDraft);
  const addPlayer = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.name.trim()) return;
    onChange([{ ...draft, id: crypto.randomUUID(), name: draft.name.trim(), category: draft.category.trim(), team: draft.team.trim(), position: draft.position.trim(), notes: draft.notes.trim(), createdAt: new Date().toISOString() }, ...players]);
    setDraft(emptyDraft());
  };
  return <div className="scouting-layout">
    <form className="scouting-form" onSubmit={addPlayer}>
      <header><span><UserSearch size={19} /></span><div><h2>Anotar jugador</h2><p>Guarda los datos básicos para poder hacer seguimiento.</p></div></header>
      <div className="scouting-fields">
        <label><span>Nombre</span><input required value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} placeholder="Nombre del jugador" /></label>
        <label><span>Categoría</span><input value={draft.category} onChange={event => setDraft(current => ({ ...current, category: event.target.value }))} placeholder="Ej. Alevín" /></label>
        <label><span>Equipo actual</span><input value={draft.team} onChange={event => setDraft(current => ({ ...current, team: event.target.value }))} placeholder="Equipo en el que juega" /></label>
        <label><span>Posición</span><input value={draft.position} onChange={event => setDraft(current => ({ ...current, position: event.target.value }))} placeholder="Ej. Lateral derecho" /></label>
        <label><span>Posibilidad de contacto real</span><select value={draft.contact} onChange={event => setDraft(current => ({ ...current, contact: event.target.value as ContactPossibility }))}><option value="por-confirmar">Por confirmar</option><option value="si">Sí</option><option value="no">No</option></select></label>
        <label className="scouting-notes"><span>Anotaciones</span><textarea rows={4} value={draft.notes} onChange={event => setDraft(current => ({ ...current, notes: event.target.value }))} placeholder="Lo que te ha llamado la atención…" /></label>
      </div>
      <button className="primary-button scouting-submit" type="submit"><Plus size={17} /> Guardar jugador</button>
    </form>
    <ScoutingList players={players} onDelete={id => onChange(players.filter(player => player.id !== id))} />
  </div>;
}

export function ScoutingList({ players, onDelete }: { players: ScoutedPlayer[]; onDelete?: (id: string) => void }) {
  if (!players.length) return <div className="scouting-empty"><UserSearch size={28} /><strong>No hay jugadores anotados</strong><span>Los jugadores guardados aparecerán aquí.</span></div>;
  return <section className="scouting-list">{players.map(player => <article key={player.id}>
    <header><div><h3>{player.name}</h3><span>{player.category || 'Categoría sin indicar'} · {player.position || 'Posición sin indicar'}</span></div>{onDelete && <button type="button" aria-label={`Eliminar a ${player.name}`} onClick={() => onDelete(player.id)}><Trash2 size={16} /></button>}</header>
    <div className="scouting-player-meta"><span><small>Equipo</small><strong>{player.team || 'Sin indicar'}</strong></span><span><small>Contacto real</small><strong className={`contact-${player.contact}`}>{contactLabel[player.contact] || 'Por confirmar'}</strong></span></div>
    {player.notes && <p>{player.notes}</p>}
    <time dateTime={player.createdAt}>{new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(player.createdAt))}</time>
  </article>)}</section>;
}
