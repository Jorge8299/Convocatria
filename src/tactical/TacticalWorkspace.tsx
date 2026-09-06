import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ArrowLeft, Check, Copy, FolderOpen, LockKeyhole, Maximize2, MousePointer2, Plus, Redo2, Save, Shield, Trash2, Undo2, Unlock, X } from 'lucide-react';
import type { ClubAccount } from '../clubTypes';
import { clubApi, getStored } from '../api';
import { Pitch } from './Pitch';
import { Piece } from './Piece';
import { canEditBoardDevice, createBoard, createElement, duplicateElement, isPlayer, moveElement, PIECE_INFO, PIECE_KINDS, prepareBoard, validBoard, type BoardContext, type BoardElement, type PieceKind, type TacticalBoard } from './model';
import './tactical.css';

interface RosterPlayer { id: string; name: string; number: string; role: 'jugador' | 'portero'; active: boolean }
interface Props { account: ClubAccount; team: { name: string; players: RosterPlayer[] }; documents: Record<string, TacticalBoard>; context?: BoardContext; initialId?: string | null; onSaved: (board: TacticalBoard) => void; onLegacy: () => void }

function deviceEditable() {
  return canEditBoardDevice({ phone: /iPhone|iPod|Android.*Mobile|Windows Phone/i.test(navigator.userAgent), width: innerWidth, height: innerHeight, coarse: matchMedia('(pointer: coarse)').matches });
}
function useEditable() {
  const [editable, setEditable] = useState(deviceEditable);
  useEffect(() => { const update = () => setEditable(deviceEditable()); addEventListener('resize', update); return () => removeEventListener('resize', update) }, []);
  return editable;
}
function draftKey(accountId: string) { return `convo_tactical_draft_v1_${accountId}` }
function readDraft(accountId: string) {
  try { const draft = JSON.parse(localStorage.getItem(draftKey(accountId)) || 'null'); return validBoard(draft) && draft.ownerAccountId === accountId ? draft : null } catch { return null }
}
export function TacticalWorkspace(props: Props) {
  const editable = useEditable();
  const [documents, setDocuments] = useState(props.documents);
  const [open, setOpen] = useState<TacticalBoard | null>(() => props.initialId ? props.documents[props.initialId] || null : null);
  const [draft, setDraft] = useState<TacticalBoard | null>(() => readDraft(props.account.id));
  const [loadMessage, setLoadMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const refresh = async () => {
    setLoading(true); setLoadMessage('');
    try {
      const data = await clubApi.bootstrap();
      if (data.session?.id !== props.account.id) throw new Error('La sesión ha cambiado. Vuelve a entrar con tu cuenta.');
      const stored = getStored<{ tacticalById?: Record<string, TacticalBoard> }>(data.stores || [], props.account.id, 'boards', {});
      setDocuments(stored.tacticalById || {});
    } catch (error) { setLoadMessage(error instanceof Error ? error.message : 'No se pudo actualizar la biblioteca.') }
    finally { setLoading(false) }
  };
  const boards = (Object.values(documents) as TacticalBoard[]).filter(board => validBoard(board) && board.ownerAccountId === props.account.id).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
  const openBoard = (board: TacticalBoard) => {
    if (editable && draft && JSON.stringify(draft) !== JSON.stringify(board) && !confirm('Hay un borrador pendiente. Si editas esta versión, sustituirá ese borrador en este dispositivo. ¿Continuar?')) return;
    setOpen(board);
  };
  if (open) return <TacticalEditor initial={open} saved={documents[open.id]} editable={editable} players={props.team.players.filter(p => p.active)}
    onBack={() => { setOpen(null); setDraft(readDraft(props.account.id)) }}
    onSaved={board => { setDocuments(current => ({ ...current, [board.id]: board })); setDraft(null); props.onSaved(board) }} />;
  return <section className="tactic-library">
    <header><div><span className="tactic-eyebrow">CONVO · PIZARRA TÁCTICA</span><h2>El juego en tus ideas.</h2><p>Tu equipo, tu campo y una nueva forma de preparar la sesión.</p></div>{editable && <button className="tactic-primary" onClick={() => openBoard(createBoard(props.account, props.team.name, props.context))}><Plus size={18} /> Nueva pizarra</button>}</header>
    {!editable && <ReadOnlyNotice />}
    {draft && editable && <div className="tactic-draft-notice"><span>Tienes un borrador en este dispositivo: <strong>{draft.name}</strong></span><button onClick={() => setOpen(draft)}>Recuperar borrador</button></div>}
    {props.context?.kind === 'match' && <p className="tactic-context"><Shield size={16} /> Preparando: {props.context.label}</p>}
    <div className="tactic-library-heading"><strong>Mis pizarras <span>{boards.length}</span></strong><button onClick={() => void refresh()} disabled={loading}><FolderOpen size={15} />{loading ? 'Actualizando…' : 'Actualizar biblioteca'}</button></div>
    {loadMessage && <p role="alert">{loadMessage}</p>}
    <div className="tactic-library-grid">{boards.map(board => <button className="tactic-board-card" onClick={() => openBoard(board)} key={board.id}>
      <svg viewBox="0 0 1100 720" aria-hidden="true"><Pitch fieldType={board.fieldType} />{board.elements.map(element => <g key={element.id} transform={`translate(${60 + element.x * 9.8} ${75 + element.y * 5.7}) scale(.8) translate(-32 -45)`}><Piece element={element} /></g>)}</svg>
      <div><span>{board.fieldType} · {board.category || 'Equipo'}</span><h3>{board.name}</h3><p>{board.team} · {board.playerCount} jugadores</p><small>{new Date(board.updatedAt).toLocaleDateString('es-ES')} · {board.author}</small></div>
    </button>)}</div>
    {!boards.length && <div className="tactic-library-empty"><svg viewBox="0 0 1100 720" aria-hidden="true"><Pitch fieldType="F8" /></svg><div><h3>Todo empieza sobre el campo.</h3><p>{editable ? 'Crea tu primera pizarra, coloca las fichas y guarda la idea para tu equipo.' : 'Aquí podrás consultar las pizarras guardadas por tu entrenador.'}</p></div></div>}
    <button className="tactic-legacy-link" onClick={props.onLegacy}>Abrir la pizarra anterior y sus alineaciones →</button>
  </section>;
}

function ReadOnlyNotice() { return <div className="tactic-readonly" role="status"><LockKeyhole size={17} /><span>Modo consulta. La edición está disponible únicamente en tablet y ordenador.</span></div> }

function TacticalEditor({ initial, saved, editable, players, onBack, onSaved }: { initial: TacticalBoard; saved?: TacticalBoard; editable: boolean; players: RosterPlayer[]; onBack: () => void; onSaved: (board: TacticalBoard) => void }) {
  const [board, setBoard] = useState(initial);
  const [savedSnapshot, setSavedSnapshot] = useState(saved ? JSON.stringify(saved) : '');
  const [past, setPast] = useState<TacticalBoard[]>([]);
  const [future, setFuture] = useState<TacticalBoard[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<BoardElement[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [details, setDetails] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: string; pointerId: number; offsetX: number; offsetY: number; original: BoardElement[]; latest: BoardElement[] } | null>(null);
  const raf = useRef<number | null>(null);
  const dirty = JSON.stringify(board) !== savedSnapshot;
  const canEdit = editable && !saving;
  const selectedPiece = board.elements.find(e => e.id === selected);
  const elements = preview || board.elements;
  const commit = (next: TacticalBoard) => {
    if (!canEdit || JSON.stringify(next) === JSON.stringify(board)) return;
    setPast(history => [...history.slice(-39), board]); setFuture([]); setBoard(next); setMessage('');
  };
  useEffect(() => {
    if (!dirty || !editable) return;
    try { localStorage.setItem(draftKey(board.ownerAccountId), JSON.stringify(board)) }
    catch { setMessage('No se pudo conservar el borrador en este dispositivo. Guarda la pizarra antes de salir.') }
  }, [board, dirty, editable]);
  useEffect(() => { const warn = (event: BeforeUnloadEvent) => { if (dirty && editable) { event.preventDefault(); event.returnValue = '' } }; addEventListener('beforeunload', warn); return () => removeEventListener('beforeunload', warn) }, [dirty, editable]);
  useEffect(() => () => { if (raf.current !== null) cancelAnimationFrame(raf.current) }, []);
  useEffect(() => { if (!editable) { drag.current = null; setPreview(null); setSelected(null) } }, [editable]);
  const undo = () => { if (!canEdit || !past.length) return; setFuture(next => [board, ...next]); setBoard(past[past.length - 1]); setPast(past.slice(0, -1)); setSelected(null) };
  const redo = () => { if (!canEdit || !future.length) return; setPast(previous => [...previous, board]); setBoard(future[0]); setFuture(future.slice(1)); setSelected(null) };
  const remove = () => { if (selectedPiece && !selectedPiece.locked) { commit({ ...board, elements: board.elements.filter(e => e.id !== selected) }); setSelected(null) } };
  const duplicate = () => { if (!selectedPiece || board.elements.length >= 80) return; const piece = duplicateElement(selectedPiece); commit({ ...board, elements: [...board.elements, piece] }); setSelected(piece.id) };
  const add = (kind: PieceKind) => { if (!canEdit || board.elements.length >= 80) return; const element = createElement(kind, board.elements.length); commit({ ...board, elements: [...board.elements, element] }); setSelected(element.id) };
  const updatePiece = (change: Partial<BoardElement>) => { if (selectedPiece) commit({ ...board, elements: board.elements.map(e => e.id === selected ? { ...e, ...change } : e) }) };
  const point = (event: ReactPointerEvent<SVGSVGElement>) => {
    const matrix = svgRef.current?.getScreenCTM();
    if (!matrix) return null;
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return { x: (p.x - 60) / 9.8, y: (p.y - 75) / 5.7 };
  };
  const startDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!canEdit || event.button !== 0 || drag.current) return;
    const id = (event.target as Element).closest('[data-piece-id]')?.getAttribute('data-piece-id');
    const element = board.elements.find(e => e.id === id);
    setSelected(element?.id || null);
    if (!element || element.locked) return;
    const p = point(event); if (!p) return;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: element.id, pointerId: event.pointerId, offsetX: p.x - element.x, offsetY: p.y - element.y, original: board.elements, latest: board.elements };
  };
  const moveDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    const current = drag.current; if (!canEdit || !current || current.pointerId !== event.pointerId) return;
    const p = point(event); if (!p) return;
    current.latest = moveElement(current.original, current.id, p.x - current.offsetX, p.y - current.offsetY);
    if (raf.current === null) raf.current = requestAnimationFrame(() => { raf.current = null; if (drag.current) setPreview(drag.current.latest) });
  };
  const stopDrag = (event: ReactPointerEvent<SVGSVGElement>, cancel = false) => {
    const current = drag.current; if (!current || current.pointerId !== event.pointerId) return;
    if (raf.current !== null) { cancelAnimationFrame(raf.current); raf.current = null }
    if (!cancel && canEdit) {
      const p = point(event);
      const next = p ? moveElement(current.original, current.id, p.x - current.offsetX, p.y - current.offsetY) : current.latest;
      commit({ ...board, elements: next });
    }
    drag.current = null; setPreview(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const save = async () => {
    if (!canEdit) return;
    const prepared = prepareBoard(board);
    if (!validBoard(prepared)) { setMessage('Revisa el nombre y los datos de la pizarra antes de guardar.'); setDetails(true); return }
    setSaving(true); setMessage('');
    try {
      const result = await clubApi.saveTacticalBoard(prepared);
      setBoard(result.board); setSavedSnapshot(JSON.stringify(result.board)); setPast([]); setFuture([]); onSaved(result.board);
      try { localStorage.removeItem(draftKey(board.ownerAccountId)) } catch { /* Server save already succeeded. */ }
      setMessage('Pizarra guardada en tu cuenta.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo guardar. Tu borrador se conserva.'); }
    finally { setSaving(false) }
  };
  const leave = () => { if (!saving) onBack() };
  return <section className={`tactic-editor${expanded ? ' tactic-expanded' : ''}`} aria-label="Editor de pizarra táctica" onKeyDown={event => {
    if (!canEdit || (event.target as HTMLElement).closest('input,textarea,select,button')) return;
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); remove() }
    if (event.key === 'Escape') { setSelected(null); setExpanded(false) }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo() }
  }}>
    <header className="tactic-topbar"><button aria-label="Volver a mis pizarras" onClick={leave} disabled={saving}><ArrowLeft size={19} /></button><div className="tactic-title"><span>CONVO / {board.fieldType}</span><strong>{board.name || 'Nueva pizarra'}</strong><small>{board.team}</small></div><span className="tactic-save-state">{saving ? 'Guardando…' : dirty ? 'Borrador local' : 'Guardado'}</span><button aria-label={expanded ? 'Salir de vista ampliada' : 'Ampliar pizarra'} onClick={() => setExpanded(!expanded)}>{expanded ? <X size={18} /> : <Maximize2 size={18} />}</button>{editable && <button className="tactic-primary" onClick={() => void save()} disabled={saving || !dirty}><Save size={16} /> Guardar</button>}</header>
    {!editable && <ReadOnlyNotice />}
    {message && <p className="tactic-feedback" role="status">{message}</p>}
    <div className="tactic-workbench">
      {editable && <aside className="tactic-tools" aria-label="Elementos de la pizarra"><div className="tactic-tool-current"><MousePointer2 size={18} /><span>Mover</span></div>{['Jugadores','Material'].map((group, i) => <div className="tactic-tool-group" key={group}><span>{group}</span>{PIECE_KINDS.slice(i ? 4 : 0, i ? 6 : 4).map(kind => <button key={kind} title={`Añadir ${PIECE_INFO[kind].label.toLowerCase()}`} aria-label={`Añadir ${PIECE_INFO[kind].label.toLowerCase()}`} onClick={() => add(kind)} disabled={!canEdit || board.elements.length >= 80}><svg viewBox="0 0 64 84" aria-hidden="true"><Piece element={{ ...createElementPreview(kind) }} /></svg><span>{PIECE_INFO[kind].label}</span></button>)}</div>)}</aside>}
      <div className="tactic-field-column"><div className="tactic-field-wrap"><svg ref={svgRef} viewBox="0 0 1100 720" className={`tactic-field${canEdit ? ' editable' : ''}`} aria-label={`Campo de ${board.fieldType === 'F8' ? 'fútbol 8' : 'fútbol 11'}`} tabIndex={0} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={event => stopDrag(event)} onPointerCancel={event => stopDrag(event,true)} onLostPointerCapture={event => { if (drag.current) stopDrag(event,true) }}>
        <Pitch fieldType={board.fieldType} />
        {elements.map(element => <g key={element.id} data-piece-id={element.id} data-x={element.x} data-y={element.y} role={editable ? 'button' : 'img'} tabIndex={editable ? 0 : undefined} aria-label={`${PIECE_INFO[element.kind].label}${element.number ? ` ${element.number}` : ''}${element.locked ? ', bloqueado' : ''}`} aria-pressed={editable ? selected === element.id : undefined}
          onKeyDown={event => { if (!canEdit) return; if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(element.id) } if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)) { event.preventDefault(); commit({ ...board, elements: moveElement(board.elements,element.id,element.x + (event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0),element.y + (event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0)) }) } }}
          transform={`translate(${60 + element.x * 9.8} ${75 + element.y * 5.7}) rotate(${element.rotation}) scale(.86) translate(-32 -45)`}>
          <rect x="-5" y="-3" width="74" height="90" fill="transparent" />
          <Piece element={element} selected={selected === element.id && editable} moving={Boolean(preview && selected === element.id)} />
        </g>)}
      </svg></div><footer className="tactic-field-footer"><span><span className="tactic-live-dot" />{board.elements.filter(e => isPlayer(e.kind)).length} jugadores · {board.elements.length} elementos</span><span>{editable ? 'Selecciona una ficha y arrástrala por el campo' : 'Vista de la pizarra guardada'}</span></footer>
      {editable && <div className="tactic-actions" aria-label="Acciones de la pizarra"><button title="Deshacer" aria-label="Deshacer" onClick={undo} disabled={!canEdit || !past.length}><Undo2 size={18} /></button><button title="Rehacer" aria-label="Rehacer" onClick={redo} disabled={!canEdit || !future.length}><Redo2 size={18} /></button><span className="tactic-divider" /><button onClick={duplicate} disabled={!canEdit || !selectedPiece || board.elements.length >= 80}><Copy size={17} /> Duplicar</button><button onClick={remove} disabled={!canEdit || !selectedPiece || selectedPiece.locked}><Trash2 size={17} /> Borrar</button><button onClick={() => updatePiece({ locked: !selectedPiece?.locked })} disabled={!canEdit || !selectedPiece}>{selectedPiece?.locked ? <Unlock size={17} /> : <LockKeyhole size={17} />}{selectedPiece?.locked ? 'Desbloquear' : 'Bloquear'}</button></div>}
      </div>
      <aside className="tactic-inspector"><div className="tactic-inspector-heading"><span>{selectedPiece && editable ? 'ELEMENTO' : 'TU PIZARRA'}</span><Shield size={16} /></div>
        {selectedPiece && editable ? <div className="tactic-piece-settings"><div className="tactic-selected-preview"><svg viewBox="0 0 64 84" aria-hidden="true"><Piece element={selectedPiece} selected /></svg><strong>{PIECE_INFO[selectedPiece.kind].label}</strong></div>{isPlayer(selectedPiece.kind) && <label>Dorsal<input aria-label="Dorsal" value={selectedPiece.number} maxLength={3} disabled={!canEdit || selectedPiece.locked} onChange={e => updatePiece({ number: e.target.value.replace(/[^0-9]/g,'') })} /></label>}
          <label>Color<input type="color" aria-label="Color de la ficha" value={selectedPiece.color} disabled={!canEdit || selectedPiece.locked || selectedPiece.kind === 'ball'} onChange={e => updatePiece({ color: e.target.value })} /></label>
          {selectedPiece.kind.startsWith('home') && <label>Jugador de tu plantilla<select aria-label="Jugador de tu plantilla" disabled={!canEdit || selectedPiece.locked} value={selectedPiece.playerId || ''} onChange={e => { const player = players.find(p => p.id === e.target.value); updatePiece({ playerId: player?.id, number: player?.number || selectedPiece.number }) }}><option value="">Ficha libre</option>{players.filter(p => (p.role === 'portero') === selectedPiece.kind.includes('keeper')).map(p => <option key={p.id} value={p.id}>{p.number} · {p.name}</option>)}</select></label>}
          <button className="tactic-deselect" onClick={() => setSelected(null)}>Terminar selección <Check size={15} /></button>
        </div> : <div className="tactic-inspector-summary"><strong>{board.team}</strong><p>{board.context.label}</p><p>{board.objective || 'Cada posición cuenta. Da forma a tu próxima idea sobre el campo.'}</p><small>{board.author}</small></div>}
        <button className="tactic-details-toggle" onClick={() => setDetails(!details)} aria-expanded={details}>{details ? 'Ocultar' : 'Ver'} datos de la pizarra</button>
        {details && <fieldset className="tactic-metadata" disabled={!canEdit}><label>Nombre<input aria-label="Nombre de la pizarra" maxLength={100} value={board.name} onChange={e => commit({ ...board, name: e.target.value })} /></label><label>Tipo de campo<select aria-label="Tipo de campo" value={board.fieldType} onChange={e => commit({ ...board, fieldType: e.target.value as 'F8'|'F11' })}><option value="F8">Fútbol 8</option><option value="F11">Fútbol 11</option></select></label><label>Objetivo<input maxLength={500} value={board.objective} onChange={e => commit({ ...board, objective: e.target.value })} /></label><label>Descripción<textarea rows={3} maxLength={2000} value={board.description} onChange={e => commit({ ...board, description: e.target.value })} /></label><label>Duración (min)<input type="number" min={0} max={600} value={board.durationMinutes} onChange={e => commit({ ...board, durationMinutes: Number(e.target.value) })} /></label><p>{board.category || 'Categoría del equipo'} · {new Date(board.createdAt).toLocaleDateString('es-ES')}</p></fieldset>}
      </aside>
    </div>
  </section>;
}
function createElementPreview(kind: PieceKind): BoardElement { return { id: `preview-${kind}`, kind, x: 50, y: 50, number: PIECE_INFO[kind].number, color: PIECE_INFO[kind].color, rotation: 0, locked: false } }
