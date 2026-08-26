import { useId, useState, type MouseEvent } from "react";

export type TrainingBoardPieceKind = "attacker" | "defender" | "ball" | "cone";

export interface TrainingBoardPiece {
  id: string;
  kind: TrainingBoardPieceKind;
  x: number;
  y: number;
  label?: string;
}

export type TrainingBoardActionKind = "pass" | "run" | "dribble" | "press";

export interface TrainingBoardAction {
  id: string;
  kind: TrainingBoardActionKind;
  from: { x: number; y: number };
  to: { x: number; y: number };
  curve?: number;
  order?: number;
}

const PIECE_LABELS: Record<TrainingBoardPieceKind, string> = {
  attacker: "Atacante",
  defender: "Defensor",
  ball: "Balón",
  cone: "Cono",
};

const ACTION_LABELS: Record<TrainingBoardActionKind, string> = {
  pass: "Pase",
  run: "Carrera",
  dribble: "Conducción",
  press: "Presión",
};

const actionPath = (action: TrainingBoardAction) => {
  const middleX = (action.from.x + action.to.x) / 2;
  const middleY = (action.from.y + action.to.y) / 2 + (action.curve || 0);
  return `M ${action.from.x} ${action.from.y} Q ${middleX} ${middleY} ${action.to.x} ${action.to.y}`;
};

export function TrainingBoard({
  pieces,
  actions = [],
  onChange,
  onActionsChange,
  compact = false,
  label = "Representación del ejercicio",
}: {
  pieces: TrainingBoardPiece[];
  actions?: TrainingBoardAction[];
  onChange?: (pieces: TrainingBoardPiece[]) => void;
  onActionsChange?: (actions: TrainingBoardAction[]) => void;
  compact?: boolean;
  label?: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<"move" | TrainingBoardActionKind>("move");
  const [playing, setPlaying] = useState(false);
  const markerPrefix = useId().replace(/:/g, "");
  const editable = Boolean(onChange || onActionsChange);

  const addPiece = (kind: TrainingBoardPieceKind) => {
    if (!onChange) return;
    const id = crypto.randomUUID();
    onChange([...pieces, { id, kind, x: 50, y: 50 }]);
    setSelectedId(id);
  };

  const moveSelected = (event: MouseEvent<HTMLDivElement>) => {
    if (!selectedId) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.min(96, Math.max(4, ((event.clientX - bounds.left) / bounds.width) * 100));
    const y = Math.min(94, Math.max(6, ((event.clientY - bounds.top) / bounds.height) * 100));
    if (activeTool === "move" && onChange) {
      onChange(pieces.map((piece) => piece.id === selectedId ? { ...piece, x, y } : piece));
      return;
    }
    const selectedPiece = pieces.find((piece) => piece.id === selectedId);
    if (!selectedPiece || !onActionsChange || activeTool === "move") return;
    onActionsChange([...actions, {
      id: crypto.randomUUID(),
      kind: activeTool,
      from: { x: selectedPiece.x, y: selectedPiece.y },
      to: { x, y },
      order: actions.length + 1,
    }]);
  };

  return (
    <div className={`training-board-wrap${compact ? " compact" : ""}`}>
      {editable && !compact && (
        <div className="training-board-tools" aria-label="Herramientas de la pizarra">
          <span>1. Selecciona una ficha · 2. Elige una acción · 3. Pulsa el destino en el campo</span>
          <div>
            {(Object.keys(PIECE_LABELS) as TrainingBoardPieceKind[]).map((kind) => (
              <button type="button" key={kind} onClick={() => addPiece(kind)}>
                <i className={`board-piece-sample ${kind}`} /> + {PIECE_LABELS[kind]}
              </button>
            ))}
            <button
              type="button"
              className="remove-piece"
              disabled={!selectedId}
              onClick={() => {
                if (!onChange || !selectedId) return;
                onChange(pieces.filter((piece) => piece.id !== selectedId));
                setSelectedId(null);
              }}
            >
              Quitar ficha
            </button>
          </div>
          <div className="training-action-tools">
            <button type="button" className={activeTool === "move" ? "active" : ""} onClick={() => setActiveTool("move")}>Mover ficha</button>
            {(Object.keys(ACTION_LABELS) as TrainingBoardActionKind[]).map((kind) => (
              <button type="button" className={`${kind}${activeTool === kind ? " active" : ""}`} key={kind} onClick={() => setActiveTool(kind)}>{ACTION_LABELS[kind]}</button>
            ))}
            <button type="button" className="remove-piece" disabled={!actions.length} onClick={() => onActionsChange?.([])}>Borrar flechas</button>
          </div>
        </div>
      )}
      <div
        className={`training-board${editable ? " editable" : ""}`}
        role={editable ? "application" : "img"}
        aria-label={label}
        onClick={moveSelected}
      >
        <svg className="training-board-actions" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            {(Object.keys(ACTION_LABELS) as TrainingBoardActionKind[]).map((kind) => (
              <marker key={kind} id={`${markerPrefix}-${kind}`} markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto">
                <path d="M0,0 L5,2.5 L0,5 Z" className={`action-arrow-head ${kind}`} />
              </marker>
            ))}
          </defs>
          {actions.map((action) => {
            const path = actionPath(action);
            return (
              <g key={action.id} className={`board-action ${action.kind}`}>
                <path d={path} markerEnd={`url(#${markerPrefix}-${action.kind})`} />
                {action.order ? <text x={action.from.x + 1.5} y={action.from.y - 3}>{action.order}</text> : null}
                {playing && !compact ? (
                  <circle r="1.15">
                    <animateMotion dur="2.6s" begin={`${((action.order || 1) - 1) * .55}s`} repeatCount="indefinite" path={path} />
                  </circle>
                ) : null}
              </g>
            );
          })}
        </svg>
        <span className="training-board-halfway" />
        <span className="training-board-circle" />
        <span className="training-board-area left" />
        <span className="training-board-area right" />
        {pieces.map((piece) => (
          <button
            type="button"
            key={piece.id}
            className={`training-board-piece ${piece.kind}${selectedId === piece.id ? " selected" : ""}`}
            style={{ left: `${piece.x}%`, top: `${piece.y}%` }}
            aria-label={`${PIECE_LABELS[piece.kind]}${piece.label ? ` ${piece.label}` : ""}`}
            onClick={(event) => {
              event.stopPropagation();
              if (editable) setSelectedId(piece.id);
            }}
          >
            {piece.kind === "attacker" || piece.kind === "defender" ? piece.label : ""}
          </button>
        ))}
      </div>
      {!compact && actions.length > 0 ? (
        <div className="training-board-legend">
          <div>{(Object.keys(ACTION_LABELS) as TrainingBoardActionKind[]).filter((kind) => actions.some((action) => action.kind === kind)).map((kind) => <span className={kind} key={kind}><i /> {ACTION_LABELS[kind]}</span>)}</div>
          <button type="button" className={playing ? "playing" : ""} onClick={() => setPlaying((current) => !current)}>{playing ? "Pausar movimiento" : "Ver movimiento"}</button>
        </div>
      ) : null}
    </div>
  );
}
