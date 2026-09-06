export const PIECE_KINDS = ['home-player', 'home-keeper', 'away-player', 'away-keeper', 'ball', 'cone'] as const;
export type PieceKind = typeof PIECE_KINDS[number];
export type FieldType = 'F8' | 'F11';
export interface BoardElement {
  id: string; kind: PieceKind; x: number; y: number; number: string;
  color: string; rotation: number; locked: boolean; playerId?: string;
}
export interface BoardContext { kind: 'team' | 'match' | 'training' | 'exercise'; id: string; label: string }
// Reserved, versioned extension points; not editable in phase 1.
export interface BoardAnnotation { id: string; kind: 'arrow' | 'pass' | 'path' | 'zone' | 'text'; points: Array<{ x: number; y: number }>; color: string; text?: string }
export interface MovementTrack { elementId: string; keyframes: Array<{ time: number; x: number; y: number }> }
export interface TacticalBoard {
  schemaVersion: 1; id: string; revision: number; ownerAccountId: string;
  name: string; description: string; category: string; team: string; objective: string;
  durationMinutes: number; playerCount: number; materials: string[];
  createdAt: string; updatedAt: string; author: string; fieldType: FieldType;
  context: BoardContext; elements: BoardElement[];
  annotations: BoardAnnotation[]; tracks: MovementTrack[]; timeline: { duration: number };
}
export const PIECE_INFO: Record<PieceKind, { label: string; color: string; number: string }> = {
  'home-player': { label: 'Jugador propio', color: '#1670e8', number: '10' },
  'home-keeper': { label: 'Portero propio', color: '#21a85b', number: '1' },
  'away-player': { label: 'Jugador rival', color: '#e44843', number: '6' },
  'away-keeper': { label: 'Portero rival', color: '#df4843', number: '1' },
  ball: { label: 'Balón', color: '#ffffff', number: '' },
  cone: { label: 'Cono', color: '#f58a24', number: '' },
};
export const isPlayer = (kind: PieceKind) => kind.includes('player') || kind.includes('keeper');
export const clamp = (value: number, min = 3, max = 97) => Math.max(min, Math.min(max, value));
export function canEditBoardDevice(device: { phone: boolean; width: number; height: number; coarse: boolean }) {
  return !device.phone && device.width >= 768 && (!device.coarse || Math.min(device.width, device.height) >= 600);
}
export function createBoard(owner: { id: string; name: string; teamLabel: string; footballStage: string | null }, team: string, context?: BoardContext): TacticalBoard {
  const now = new Date().toISOString();
  return { schemaVersion: 1, id: crypto.randomUUID(), revision: 0, ownerAccountId: owner.id,
    name: context?.kind === 'match' ? `Plan de partido · ${context.label}`.slice(0, 100) : 'Nueva pizarra',
    description: '', category: owner.footballStage || '', team: owner.teamLabel || team, objective: '', durationMinutes: 15,
    playerCount: 0, materials: [], createdAt: now, updatedAt: now, author: owner.name, fieldType: 'F8',
    context: context || { kind: 'team', id: owner.id, label: owner.teamLabel || team },
    elements: [], annotations: [], tracks: [], timeline: { duration: 8 } };
}
export function createElement(kind: PieceKind, count: number): BoardElement {
  return { id: crypto.randomUUID(), kind, x: 45 + (count % 4) * 4, y: 44 + (count % 3) * 6,
    number: PIECE_INFO[kind].number, color: PIECE_INFO[kind].color, rotation: 0, locked: false };
}
export function moveElement(elements: BoardElement[], id: string, x: number, y: number) {
  return elements.map((element) => element.id === id && !element.locked ? { ...element, x: clamp(x), y: clamp(y) } : element);
}
export function duplicateElement(element: BoardElement): BoardElement {
  return { ...element, id: crypto.randomUUID(), x: clamp(element.x + (element.x > 90 ? -5 : 5)), y: clamp(element.y + (element.y > 90 ? -5 : 5)), locked: false };
}
export function prepareBoard(board: TacticalBoard): TacticalBoard {
  return { ...board, name: board.name.trim(), updatedAt: new Date().toISOString(), playerCount: board.elements.filter((element) => isPlayer(element.kind)).length,
    materials: [...new Set(board.elements.filter((element) => !isPlayer(element.kind)).map((element) => PIECE_INFO[element.kind].label))] };
}
export function validBoard(value: unknown): value is TacticalBoard {
  if (!value || typeof value !== 'object') return false;
  const b = value as TacticalBoard;
  const short = (v: unknown, length: number) => typeof v === 'string' && v.length <= length;
  return b.schemaVersion === 1 && short(b.id, 80) && /^[\w-]{1,80}$/.test(b.id) && Number.isSafeInteger(b.revision) && b.revision >= 0 && b.revision < 2147483647 &&
    short(b.name, 100) && Boolean(b.name.trim()) && short(b.description, 2000) && short(b.objective, 500) &&
    short(b.team, 150) && short(b.category, 80) && short(b.author, 150) && short(b.ownerAccountId, 100) &&
    Number.isInteger(b.playerCount) && b.playerCount >= 0 && b.playerCount <= 80 && Array.isArray(b.materials) && b.materials.length <= 6 && b.materials.every(m => short(m, 80)) &&
    Number.isFinite(b.durationMinutes) && b.durationMinutes >= 0 && b.durationMinutes <= 600 &&
    ['F8', 'F11'].includes(b.fieldType) && Boolean(b.context) && ['team','match','training','exercise'].includes(b.context.kind) &&
    short(b.context.id, 100) && short(b.context.label, 200) && Number.isFinite(Date.parse(b.createdAt)) && Number.isFinite(Date.parse(b.updatedAt)) &&
    Array.isArray(b.elements) && b.elements.length <= 80 && new Set(b.elements.map(e => e?.id)).size === b.elements.length &&
    b.elements.every(e => e && short(e.id, 80) && Boolean(e.id) && PIECE_KINDS.includes(e.kind) && Number.isFinite(e.x) && e.x >= 3 && e.x <= 97 &&
      Number.isFinite(e.y) && e.y >= 3 && e.y <= 97 && short(e.number, 3) && /^#[\da-f]{6}$/i.test(e.color) &&
      Number.isFinite(e.rotation) && Math.abs(e.rotation) <= 360 && typeof e.locked === 'boolean' && (e.playerId === undefined || short(e.playerId, 100))) &&
    Array.isArray(b.annotations) && b.annotations.length === 0 && Array.isArray(b.tracks) && b.tracks.length === 0 &&
    Boolean(b.timeline) && Number.isFinite(b.timeline.duration) && b.timeline.duration >= 0 && b.timeline.duration <= 600;
}
